import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  createPurchaseWithAssetsSchema,
  purchaseFiltersSchema,
} from "@/lib/validations/purchase";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { NotFoundError } from '@/lib/errors';
import { auditLogService } from '@/lib/services/auditLogService';
import {
  INCLUDE_AVANCE_REPARTO,
  WHERE_COMPRA_POR_REPARTIR,
  agregarEquiposNuevos,
  agregarLineasKit,
  avanceReparto,
  vincularEquiposExistentes,
} from '@/lib/services/compraService';

// GET /api/compras - Listar compras/facturas con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    await requirePermission('compras', 'read');

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = purchaseFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      sedeId: searchParams.get("sedeId") || undefined,
      tipoCompra: searchParams.get("tipoCompra") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "fechaFactura",
      sortOrder: searchParams.get("sortOrder") || "desc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;
    // Tarjeta "Por repartir" (SPEC 2.111.3): la misma condicion la cuenta y
    // filtra la lista.
    const soloPorRepartir = searchParams.get("vista") === "por_repartir";

    // SPEC 2.111.6: la compra es de la empresa, asi que admin y tecnico ven
    // todas (lo pendiente todavia no tiene sede destino). La sede elegida en
    // el menu filtra por sede de llegada.
    const where: Prisma.PurchaseWhereInput = {};

    if (filters.sedeId) {
      where.sedeId = filters.sedeId;
    }

    if (filters.tipoCompra) {
      where.tipoCompra = filters.tipoCompra;
    }

    if (filters.search) {
      where.OR = [
        { numeroFactura: { contains: filters.search, mode: "insensitive" } },
        { ordenCompra: { contains: filters.search, mode: "insensitive" } },
        { descripcion: { contains: filters.search, mode: "insensitive" } },
        { compradoPor: { contains: filters.search, mode: "insensitive" } },
        { rutProveedor: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    // Filtro por rango de fechas
    if (filters.fechaDesde || filters.fechaHasta) {
      where.fechaFactura = {};
      if (filters.fechaDesde) {
        where.fechaFactura.gte = new Date(filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        where.fechaFactura.lte = new Date(filters.fechaHasta);
      }
    }

    // La tarjeta "Total" cuenta sin la vista; la lista, con ella.
    const whereTotal = { ...where };
    if (soloPorRepartir) where.AND = [WHERE_COMPRA_POR_REPARTIR];

    // Ejecutar consulta
    const [purchases, total, totalCompras, porRepartir] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: {
          sede: {
            select: { id: true, nombre: true, codigo: true },
          },
          _count: {
            select: { purchaseAssets: true },
          },
          ...INCLUDE_AVANCE_REPARTO,
        },
        orderBy: { [filters.sortBy]: filters.sortOrder },
        skip,
        take: filters.limit,
      }),
      prisma.purchase.count({ where }),
      prisma.purchase.count({ where: whereTotal }),
      // Compras con algo por repartir, con los mismos filtros (tarjeta).
      prisma.purchase.count({ where: { AND: [whereTotal, WHERE_COMPRA_POR_REPARTIR] } }),
    ]);

    return NextResponse.json({
      // Cada compra con su avance de reparto, sin las lineas que lo calculan.
      data: purchases.map(({ purchaseAssets, purchaseKitItems, ...compra }) => ({
        ...compra,
        reparto: avanceReparto({ purchaseAssets, purchaseKitItems }),
      })),
      pagination: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
      stats: {
        totalCompras,
        porRepartir,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener compras');
  }
}

// POST /api/compras - Registrar una compra (SPEC 2.111.1, solo admin). Lo
// comprado queda "Por repartir" en la sede de llegada: los equipos nuevos se
// crean aqui mismo y el Kit/EPP no suma stock hasta repartirlo.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('compras', 'write');
    const usuario = session.user?.email || 'sistema';

    const body = await request.json();

    const validationResult = createPurchaseWithAssetsSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;
    // Solo admin registra (matriz 1.3.1) y la sede ya viene validada.
    const sedeId = data.sedeId;

    const sede = await prisma.sede.findUnique({ where: { id: sedeId } });
    if (!sede) throw new NotFoundError('La sede de llegada no existe');

    // N° de factura unico en todo el sistema. Se valida aca y no con un
    // indice unico en la base para no exigir una migracion; el numero es
    // opcional en el esquema, asi que solo se comprueba cuando viene con
    // valor.
    if (data.numeroFactura) {
      const duplicada = await prisma.purchase.findFirst({
        where: { numeroFactura: data.numeroFactura },
        select: { id: true },
      });
      if (duplicada) {
        return respuestaDatosInvalidos(
          new z.ZodError([
            {
              code: "custom",
              path: ["numeroFactura"],
              message: `Ya existe una compra con la factura ${data.numeroFactura}.`,
            },
          ])
        );
      }
    }

    // Todo en una transaccion: si un equipo no se puede crear (N° de serie
    // repetido), no queda ni la compra ni el resto de los equipos.
    const purchase = await prisma.$transaction(async (tx) => {
      const compra = await tx.purchase.create({
        data: {
          sedeId,
          numeroFactura: data.numeroFactura,
          fechaFactura: data.fechaFactura,
          rutProveedor: data.rutProveedor,
          descripcion: data.descripcion,
          compradoPor: data.compradoPor,
          ordenCompra: data.ordenCompra,
          tipoCompra: data.tipoCompra,
        },
      });

      await auditLogService.registrarCreacion(
        'compra',
        compra.id,
        `Compra creada: factura ${compra.numeroFactura}`,
        {
          numeroFactura: compra.numeroFactura,
          rutProveedor: compra.rutProveedor,
          tipoCompra: compra.tipoCompra,
          sedeId: compra.sedeId,
          equiposNuevos: data.equiposNuevos.length,
          equiposVinculados: data.assets.length,
          lineasKit: data.kitItems.length,
        },
        usuario,
        tx
      );

      await agregarEquiposNuevos(tx, compra, data.equiposNuevos, usuario);
      if (data.assets.length > 0) {
        await vincularEquiposExistentes(tx, compra, data.assets.map((a) => a.assetId), usuario);
      }
      if (data.kitItems.length > 0) {
        await agregarLineasKit(tx, compra, data.kitItems);
      }

      return tx.purchase.findUniqueOrThrow({
        where: { id: compra.id },
        include: {
          sede: { select: { id: true, nombre: true, codigo: true } },
          ...INCLUDE_AVANCE_REPARTO,
        },
      });
    });

    return NextResponse.json({ ...purchase, reparto: avanceReparto(purchase) }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear compra');
  }
}
