import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  createPurchaseWithAssetsSchema,
  purchaseFiltersSchema,
} from "@/lib/validations/purchase";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

// GET /api/compras - Listar compras/facturas con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    await requirePermission('compras', 'read');

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = purchaseFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      supplierId: searchParams.get("supplierId") || undefined,
      moneda: searchParams.get("moneda") || undefined,
      tipoCompra: searchParams.get("tipoCompra") || undefined,
      metodoPago: searchParams.get("metodoPago") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      montoMin: searchParams.get("montoMin") || undefined,
      montoMax: searchParams.get("montoMax") || undefined,
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

    // Construir condiciones de búsqueda
    const where: Prisma.PurchaseWhereInput = {};

    if (filters.supplierId) {
      where.supplierId = filters.supplierId;
    }

    if (filters.moneda) {
      where.moneda = filters.moneda;
    }

    if (filters.tipoCompra) {
      where.tipoCompra = filters.tipoCompra;
    }

    if (filters.metodoPago) {
      where.metodoPago = filters.metodoPago;
    }

    if (filters.search) {
      where.OR = [
        { numeroFactura: { contains: filters.search, mode: "insensitive" } },
        { ordenCompra: { contains: filters.search, mode: "insensitive" } },
        { descripcion: { contains: filters.search, mode: "insensitive" } },
        { compradoPor: { contains: filters.search, mode: "insensitive" } },
        { supplier: { razonSocial: { contains: filters.search, mode: "insensitive" } } },
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

    // Filtro por rango de montos
    if (filters.montoMin !== undefined || filters.montoMax !== undefined) {
      where.montoTotal = {};
      if (filters.montoMin !== undefined) {
        where.montoTotal.gte = filters.montoMin;
      }
      if (filters.montoMax !== undefined) {
        where.montoTotal.lte = filters.montoMax;
      }
    }

    // Ejecutar consulta
    const [purchases, total] = await Promise.all([
      prisma.purchase.findMany({
        where,
        include: {
          supplier: {
            select: {
              id: true,
              razonSocial: true,
              rutEmpresa: true,
            },
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

    // Calcular totales para estadísticas
    const stats = await prisma.purchase.aggregate({
      where,
      _sum: {
        montoTotal: true,
      },
      _count: true,
    });

    return NextResponse.json({
      data: purchases,
      pagination: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
      stats: {
        totalCompras: stats._count,
        montoTotal: stats._sum.montoTotal || 0,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener compras');
  }
}

// POST /api/compras - Crear nueva compra/factura con activos opcionales
export async function POST(request: NextRequest) {
  try {
    await requirePermission('compras', 'write');

    const body = await request.json();

    const validationResult = createPurchaseWithAssetsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que el proveedor existe (si se proporciona)
    if (data.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: data.supplierId },
      });

      if (!supplier) {
        return NextResponse.json(
          { error: "Proveedor no encontrado" },
          { status: 404 }
        );
      }
    }

    // Verificar que los activos existen (si se proporcionan)
    if (data.assets && data.assets.length > 0) {
      const assetIds = data.assets.map((a) => a.assetId);
      const existingAssets = await prisma.asset.findMany({
        where: { ...ACTIVOS_VIGENTES, id: { in: assetIds } },
        select: { id: true },
      });

      const existingAssetIds = new Set(existingAssets.map((a) => a.id));
      const missingAssets = assetIds.filter((id) => !existingAssetIds.has(id));

      if (missingAssets.length > 0) {
        return NextResponse.json(
          { error: "Algunos activos no existen", missingAssets },
          { status: 404 }
        );
      }
    }

    // Crear la compra en una transacción
    const purchase = await prisma.$transaction(async (tx) => {
      // Crear la compra
      const newPurchase = await tx.purchase.create({
        data: {
          supplierId: data.supplierId,
          numeroFactura: data.numeroFactura,
          fechaFactura: data.fechaFactura,
          montoTotal: data.montoTotal,
          moneda: data.moneda,
          tipoCompra: data.tipoCompra,
          metodoPago: data.metodoPago,
          descripcion: data.descripcion,
          compradoPor: data.compradoPor,
          ordenCompra: data.ordenCompra,
          documentoUrl: data.documentoUrl,
        },
      });

      // Vincular activos si se proporcionan
      if (data.assets && data.assets.length > 0) {
        await tx.purchaseAsset.createMany({
          data: data.assets.map((asset) => ({
            purchaseId: newPurchase.id,
            assetId: asset.assetId,
            precioUnitario: asset.precioUnitario,
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
          supplier: {
            select: {
              id: true,
              razonSocial: true,
              rutEmpresa: true,
            },
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
