import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError } from '@/shared/errores';
import type { PurchaseFilters } from '@/modules/compras/validaciones';
import {
  INCLUDE_AVANCE_REPARTO,
  WHERE_COMPRA_POR_REPARTIR,
  avanceReparto,
  sinAsignacion,
} from '@/modules/compras/servicio';

/**
 * Lecturas de Compras contra la base (SPEC 3.2.2). La compra es de la
 * empresa: todos ven todas (SPEC 2.111.6).
 */

export async function buscarCompra(id: string) {
  const compra = await prisma.purchase.findUnique({ where: { id } });
  if (!compra) throw new NotFoundError('Compra no encontrada');
  return compra;
}

/**
 * Lista de compras (GET /api/compras), con el avance de reparto de cada una
 * y las tarjetas "Total" y "Por repartir" (SPEC 2.111.3).
 */
export async function listarCompras(filters: PurchaseFilters, vista: string | null) {
  const skip = (filters.page - 1) * filters.limit;
  // Tarjeta "Por repartir" (SPEC 2.111.3): la misma condicion la cuenta y
  // filtra la lista.
  const soloPorRepartir = vista === "por_repartir";

  // SPEC 2.111.6: la compra es de la empresa, todos ven todas. La sede
  // elegida en el menu filtra por sede de llegada.
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

  return {
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
  };
}

/** Compra con sus equipos, su Kit/EPP y el avance del reparto (GET /api/compras/[id]). */
export async function detalleCompra(id: string) {
  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      sede: {
        select: { id: true, nombre: true, codigo: true },
      },
      purchaseAssets: {
        include: {
          asset: {
            include: {
              categoria: true,
              sede: { select: { id: true, nombre: true } },
            },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      // Lineas de Kit/EPP compradas con esta factura, y a donde se
      // repartio cada parte (SPEC 2.111).
      purchaseKitItems: {
        include: {
          item: true,
          repartos: {
            include: {
              sede: { select: { id: true, nombre: true } },
              guide: { select: { id: true, numero: true, estado: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "asc" },
      },
      // Despachos que creo el reparto hacia otras sedes.
      despachos: {
        select: {
          id: true,
          numero: true,
          estado: true,
          fechaDespacho: true,
          sedeDestino: { select: { id: true, nombre: true } },
          _count: { select: { items: true, kitItems: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!purchase) throw new NotFoundError('Compra no encontrada');

  // Un equipo descartado (se quito antes de repartirlo) ya no es parte de
  // la compra que se muestra; su registro queda en el historial.
  // Compras muestra los equipos comprados y a que sede se repartieron, no
  // a quien estan asignados (SPEC 2.111.6): ni a admin ni a tecnico.
  const purchaseAssets = purchase.purchaseAssets
    .filter((pa) => !pa.asset.deletedAt)
    .map((pa) => ({ ...pa, asset: sinAsignacion(pa.asset) }));

  return {
    ...purchase,
    purchaseAssets,
    reparto: avanceReparto(purchase),
    stats: {
      cantidadActivos: purchaseAssets.length,
      cantidadArticulosKit: purchase.purchaseKitItems.length,
    },
  };
}

/** Lo que se muestra de cada equipo de una compra. */
export const INCLUDE_EQUIPO_COMPRA = {
  asset: { include: { categoria: true, sede: { select: { id: true, nombre: true } } } },
} as const;

/** Equipos vigentes de una compra, sin a quien estan asignados (SPEC 2.111.6). */
export async function equiposDeCompra(id: string, cliente: Prisma.TransactionClient = prisma) {
  const vinculos = await cliente.purchaseAsset.findMany({
    where: { purchaseId: id, asset: { deletedAt: null } },
    include: INCLUDE_EQUIPO_COMPRA,
    orderBy: { createdAt: 'asc' },
  });
  return vinculos.map((pa) => ({ ...pa, asset: sinAsignacion(pa.asset) }));
}

/** Lineas de Kit/EPP de una compra. */
export function lineasKitDeCompra(id: string, cliente: Prisma.TransactionClient = prisma) {
  return cliente.purchaseKitItem.findMany({
    where: { purchaseId: id },
    include: { item: true },
    orderBy: { createdAt: 'asc' },
  });
}
