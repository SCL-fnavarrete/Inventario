import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { createAssignmentSchema, assignmentFiltersSchema } from "@/modules/asignaciones";
import { executeAssignment } from "@/modules/solicitudes/servidor";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { filtroSede } from '@/shared/sedes/filtro';
import { coincideBusqueda } from '@/shared/utilidades/text';

export const dynamic = 'force-dynamic';

// GET /api/asignaciones - Listar asignaciones con filtros
export async function GET(request: NextRequest) {
  try {
    await requirePermission('asignaciones', 'read');

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = assignmentFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      employeeId: searchParams.get("employeeId") || undefined,
      assetId: searchParams.get("assetId") || undefined,
      activo: searchParams.get("activo") || undefined,
      tipoMovimiento: searchParams.get("tipoMovimiento") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "fechaEntrega",
      sortOrder: searchParams.get("sortOrder") || "desc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Assignment no tiene sedeId propio: la sede del navbar filtra por la del activo.
    const where: Prisma.AssignmentWhereInput = {
      asset: filtroSede(searchParams.get("sedeId")),
    };

    if (filters.employeeId) {
      where.employeeId = filters.employeeId;
    }

    if (filters.assetId) {
      where.assetId = filters.assetId;
    }

    if (filters.activo !== undefined) {
      where.activo = filters.activo;
    }

    if (filters.tipoMovimiento) {
      where.tipoMovimiento = filters.tipoMovimiento;
    }

    if (filters.fechaDesde || filters.fechaHasta) {
      where.fechaEntrega = {};
      if (filters.fechaDesde) {
        where.fechaEntrega.gte = new Date(filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        where.fechaEntrega.lte = new Date(filters.fechaHasta);
      }
    }

    // Filtrado en memoria (igual que /api/empleados): normaliza el RUT
    // (quita puntos/guion) e ignora acentos en nombre/apellido, ya que el
    // volumen de datos es chico y no justifica un indice dedicado.
    const terminoBusqueda = filters.search?.trim() ?? "";

    let assignments;
    let total;

    if (terminoBusqueda) {
      const todas = await prisma.assignment.findMany({
        where,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: {
          asset: {
            include: {
              categoria: true,
            },
          },
          employee: true,
        },
      });

      // RUT sin formato, o palabra por palabra (coincideBusqueda): "juan
      // lenovo" encuentra el Lenovo de Juan.
      const filtradas = todas.filter((a) =>
        coincideBusqueda(terminoBusqueda, {
          rut: a.employee.rut,
          campos: [
            a.employee.nombres,
            a.employee.apellidoPaterno,
            a.employee.apellidoMaterno,
            a.asset.numeroSerie,
            a.asset.imei,
            a.asset.marca,
            a.asset.modelo,
          ],
        })
      );

      total = filtradas.length;
      assignments = filtradas.slice(skip, skip + filters.limit);
    } else {
      [assignments, total] = await Promise.all([
        prisma.assignment.findMany({
          where,
          skip,
          take: filters.limit,
          orderBy: { [filters.sortBy]: filters.sortOrder },
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
            employee: true,
          },
        }),
        prisma.assignment.count({ where }),
      ]);
    }

    return NextResponse.json({
      data: assignments,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    },
    {headers:{"Cache-Control":"no-store, max-age=0"}}
  );
  } catch (error) {
    return handleApiError(error, 'Error al obtener asignaciones');
  }
}

// POST /api/asignaciones - Crear nueva asignacion
export async function POST(request: NextRequest) {
  try {
    await requirePermission('asignaciones', 'write');

    const body = await request.json();

    const validationResult = createAssignmentSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Validar sede de activo y empleado antes de ejecutar; executeAssignment
    // en si no lo hace porque tambien lo usa el flujo de Solicitudes.
    const [assetParaAsignar, employeeParaAsignar] = await Promise.all([
      prisma.asset.findUnique({ where: { id: data.assetId }, select: { sedeId: true } }),
      prisma.employee.findUnique({ where: { id: data.employeeId }, select: { sedeId: true } }),
    ]);
    if (!assetParaAsignar) {
      return NextResponse.json({ error: "Activo no encontrado" }, { status: 404 });
    }
    if (!employeeParaAsignar) {
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
    }

    // Crear asignación y actualizar activo en una transacción usando servicio compartido
    const result = await prisma.$transaction(async (tx) => {
      return executeAssignment(tx, {
        sedeId: employeeParaAsignar.sedeId,
        assetId: data.assetId,
        employeeId: data.employeeId,
        fechaEntrega: data.fechaEntrega,
        lugarEntrega: data.lugarEntrega,
        entregadoPor: data.entregadoPor,
        tipoMovimiento: data.tipoMovimiento,
        motivo: data.motivo,
        nombreEquipo: data.nombreEquipo,
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear asignación');
  }
}
