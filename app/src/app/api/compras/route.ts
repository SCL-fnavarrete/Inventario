import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createPurchaseWithAssetsSchema,
  purchaseFiltersSchema,
} from "@/lib/validations/purchase";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere, sedeIdParaCrear, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

// GET /api/compras - Listar compras/facturas con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('compras', 'read');

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
      return NextResponse.json(
        { error: "Parámetros inválidos", details: filtersResult.error.issues },
        { status: 400 }
      );
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Construir condiciones de búsqueda. Aislamiento por sede (11-sep-2026,
    // compras ya no es admin-only): un tecnico solo ve las compras de su
    // propia sede, admin ve todas -- igual criterio que Activos/Empleados.
    const where: Prisma.PurchaseWhereInput = { ...sedeWhere(session) };

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

    // Ejecutar consulta
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: {
          sede: {
            select: { id: true, nombre: true, codigo: true },
          },
          _count: {
            select: { purchaseAssets: true },
          },
        },
        orderBy: { [filters.sortBy]: filters.sortOrder },
        skip,
        take: filters.limit,
      }),
      prisma.purchase.count({ where }),
    ]);

    return NextResponse.json({
      data: purchases,
      pagination: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
      stats: {
        totalCompras: total,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener compras');
  }
}

// POST /api/compras - Crear nueva compra/factura con activos opcionales
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('compras', 'write');

    const body = await request.json();

    const validationResult = createPurchaseWithAssetsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const esAdmin = tieneVisibilidadTotal(session);

    // Verificar que la sede existe (si se proporciona)
    if (data.sedeId) {
      const sede = await prisma.sede.findUnique({ where: { id: data.sedeId } });
      if (!sede) {
        return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 });
      }
    }

    // Verificar que los activos existen (si se proporcionan)
    if (data.assets && data.assets.length > 0) {
      const assetIds = data.assets.map((a) => a.assetId);
      const existingAssets = await prisma.asset.findMany({
        where: { ...ACTIVOS_VIGENTES, id: { in: assetIds } },
        select: { id: true, sedeId: true },
      });

      const existingAssetIds = new Set(existingAssets.map((a) => a.id));
      const missingAssets = assetIds.filter((id) => !existingAssetIds.has(id));

      if (missingAssets.length > 0) {
        return NextResponse.json(
          { error: "Algunos activos no existen", missingAssets },
          { status: 404 }
        );
      }

      // Defensa en profundidad: un tecnico solo puede asociar a la compra
      // activos de su propia sede, aunque el selector del formulario ya
      // venga filtrado. Ver SPEC 2.9.
      if (!esAdmin) {
        const ajenos = existingAssets.filter((a) => a.sedeId !== session.user.sedeId);
        if (ajenos.length > 0) {
          return NextResponse.json(
            { error: "Algunos activos no pertenecen a tu sede" },
            { status: 400 }
          );
        }
      }
    }

    // Crear la compra en una transacción
    const purchase = await prisma.$transaction(async (tx) => {
      // Crear la compra
      const newPurchase = await tx.purchase.create({
        data: {
          // Tecnico: siempre su propia sede (se ignora cualquier sedeId
          // del body). Admin: obligado a elegir una entre las sedes
          // existentes -- ya no puede dejarla transversal (11-sep-2026,
          // alineado con activos/empleados/solicitudes/guias, ver SPEC
          // 2.8.2). Se reusa la misma funcion que esos modulos.
          sedeId: sedeIdParaCrear(session, data.sedeId, { requerido: true }),
          numeroFactura: data.numeroFactura,
          fechaFactura: data.fechaFactura,
          rutProveedor: data.rutProveedor,
          descripcion: data.descripcion,
          compradoPor: data.compradoPor,
          ordenCompra: data.ordenCompra,
          tipoCompra: data.tipoCompra,
        },
      });

      // Vincular activos si se proporcionan
      if (data.assets && data.assets.length > 0) {
        await tx.purchaseAsset.createMany({
          data: data.assets.map((asset) => ({
            purchaseId: newPurchase.id,
            assetId: asset.assetId,
          })),
        });

        // Actualizar fecha de compra en los activos
        await tx.asset.updateMany({
          where: {
            id: { in: data.assets.map((a) => a.assetId) },
          },
          data: {
            fechaCompra: data.fechaFactura,
          },
        });
      }

      // Retornar la compra con sus relaciones
      return await tx.purchase.findUnique({
        where: { id: newPurchase.id },
        include: {
          sede: {
            select: { id: true, nombre: true, codigo: true },
          },
          purchaseAssets: {
            include: {
              asset: {
                include: {
                  categoria: true,
                },
              },
            },
          },
        },
      });
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear compra');
  }
}
