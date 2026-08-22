import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMaintenanceSchema, maintenanceFiltersSchema } from "@/lib/validations/maintenance";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// GET /api/mantenciones - Listar mantenciones con filtros
export async function GET(request: NextRequest) {
  try {
    await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;

    const filtersResult = maintenanceFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      assetId: searchParams.get("assetId") || undefined,
      tipo: searchParams.get("tipo") || undefined,
      estado: searchParams.get("estado") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      pendientes: searchParams.get("pendientes") || undefined,
      vencidas: searchParams.get("vencidas") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "fechaProgramada",
      sortOrder: searchParams.get("sortOrder") || "asc",
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
    const where: Prisma.MaintenanceWhereInput = {};

    if (filters.assetId) {
      where.assetId = filters.assetId;
    }

    if (filters.tipo) {
      where.tipo = filters.tipo;
    }

    if (filters.estado) {
      where.estado = filters.estado;
    }

    if (filters.search) {
      where.OR = [
        { descripcion: { contains: filters.search, mode: "insensitive" } },
        { realizadoPor: { contains: filters.search, mode: "insensitive" } },
        { proveedorExterno: { contains: filters.search, mode: "insensitive" } },
        { resultado: { contains: filters.search, mode: "insensitive" } },
        { asset: { numeroSerie: { contains: filters.search, mode: "insensitive" } } },
        { asset: { marca: { contains: filters.search, mode: "insensitive" } } },
        { asset: { modelo: { contains: filters.search, mode: "insensitive" } } },
      ];
    }

    // Filtro de pendientes (estado pendiente o en_proceso)
    if (filters.pendientes) {
      where.estado = { in: ["pendiente", "en_proceso"] };
    }

    // Filtro de vencidas (fecha programada pasada y no completada)
    if (filters.vencidas) {
      where.AND = [
        { fechaProgramada: { lt: new Date() } },
        { estado: { in: ["pendiente", "en_proceso"] } },
      ];
    }

    // Filtro por rango de fechas
    if (filters.fechaDesde || filters.fechaHasta) {
      where.fechaProgramada = {};
      if (filters.fechaDesde) {
        where.fechaProgramada.gte = new Date(filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        where.fechaProgramada.lte = new Date(filters.fechaHasta);
      }
    }

    // Ejecutar consulta
    const [maintenances, total] = await Promise.all([
      prisma.maintenance.findMany({
        where,
        include: {
          asset: {
            include: {
              categoria: true,
              empleadoActual: {
                select: {
                  id: true,
                  rut: true,
                  nombres: true,
                  apellidoPaterno: true,
                },
              },
            },
          },
        },
        orderBy: { [filters.sortBy]: filters.sortOrder },
        skip,
        take: filters.limit,
      }),
      prisma.maintenance.count({ where }),
    ]);

    return NextResponse.json({
      data: maintenances,
      pagination: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones');
  }
}

// POST /api/mantenciones - Crear nueva mantención
export async function POST(request: NextRequest) {
  try {
    await requirePermission('mantenciones', 'write');
    const body = await request.json();

    const validationResult = createMaintenanceSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que el activo existe
    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
      include: { categoria: true },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    // Crear la mantención en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Crear mantención
      const maintenance = await tx.maintenance.create({
        data: {
          assetId: data.assetId,
          tipo: data.tipo,
          descripcion: data.descripcion,
          fechaProgramada: data.fechaProgramada,
          proximaMantencion: data.proximaMantencion,
          realizadoPor: data.realizadoPor,
          costo: data.costo,
          proveedorExterno: data.proveedorExterno,
          estado: "pendiente",
        },
        include: {
          asset: {
            include: { categoria: true },
          },
        },
      });

      // Actualizar estado del activo si se programa mantención
      if (data.fechaProgramada) {
        await tx.asset.update({
          where: { id: data.assetId },
          data: { estado: "en_mantencion" },
        });

        // Registrar en historial
        await tx.assetHistory.create({
          data: {
            assetId: data.assetId,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${data.tipo} programada: ${data.descripcion}`,
            datosAnteriores: { estado: asset.estado },
            datosNuevos: { estado: "en_mantencion", maintenanceId: maintenance.id },
            usuarioSistema: data.realizadoPor || "Sistema",
          },
        });
      }

      return maintenance;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear mantención');
  }
}
