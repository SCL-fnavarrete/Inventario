import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createTerminationSchema, terminationFiltersSchema } from "@/lib/validations/termination";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { sedeWhere, assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { auditLogService } from '@/lib/services/auditLogService';

// GET /api/desvinculaciones - Listar desvinculaciones con filtros
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('desvinculaciones', 'read');
    const searchParams = request.nextUrl.searchParams;

    const filtersResult = terminationFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      pendientes: searchParams.get("pendientes") || undefined,
      notificadoRrhh: searchParams.get("notificadoRrhh") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "fechaDesvinculacion",
      sortOrder: searchParams.get("sortOrder") || "desc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Termination no tiene sedeId propio -- se filtra via su relacion al
    // empleado (mismo criterio que el Dashboard: swEmployee = { employee: sw }).
    const where: Prisma.TerminationWhereInput = {
      employee: sedeWhere(session),
    };

    // Selector de sede del nav (Etapa 2): solo quien ya tiene visibilidad
    // total (admin/tecnico) puede acotar por una sede especifica.
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      where.employee = { ...(where.employee as Prisma.EmployeeWhereInput), sedeId: sedeIdFiltro };
    }

    // Filtrar por pendientes (sin devolver equipos)
    if (filters.pendientes === true) {
      where.OR = [
        { estadoNotebook: "pendiente" },
        { estadoCelular: "pendiente" },
        { estadoMonitor: "pendiente" },
        { estadoKit: "pendiente" },
      ];
    }

    // Filtrar por notificación a RRHH
    if (filters.notificadoRrhh !== undefined) {
      where.notificadoRrhh = filters.notificadoRrhh;
    }

    // Filtrar por rango de fechas
    if (filters.fechaDesde || filters.fechaHasta) {
      where.fechaDesvinculacion = {};
      if (filters.fechaDesde) {
        where.fechaDesvinculacion.gte = new Date(filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        where.fechaDesvinculacion.lte = new Date(filters.fechaHasta);
      }
    }

    // Búsqueda por RUT o nombre -- se combina con el filtro de sede de
    // arriba (no lo reemplaza).
    if (filters.search) {
      where.employee = {
        ...sedeWhere(session),
        ...(sedeIdFiltro && tieneVisibilidadTotal(session) ? { sedeId: sedeIdFiltro } : {}),
        OR: [
          { rut: { contains: filters.search, mode: "insensitive" } },
          { nombres: { contains: filters.search, mode: "insensitive" } },
          { apellidoPaterno: { contains: filters.search, mode: "insensitive" } },
        ],
      };
    }

    const [terminations, total] = await Promise.all([
      prisma.termination.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: {
          employee: {
            include: {
              assignments: {
                where: { activo: true },
                include: {
                  asset: {
                    include: { categoria: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.termination.count({ where }),
    ]);

    return NextResponse.json({
      data: terminations,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener desvinculaciones');
  }
}

// POST /api/desvinculaciones - Crear nueva desvinculación
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('desvinculaciones', 'write');
    const body = await request.json();

    const validationResult = createTerminationSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Verificar que el empleado existe
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
      include: {
        assignments: {
          where: { activo: true },
          include: {
            asset: {
              include: { categoria: true },
            },
          },
        },
      },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, employee.sedeId, 'Empleado no encontrado');

    // Verificar si ya existe una desvinculación para este empleado
    const existingTermination = await prisma.termination.findFirst({
      where: { employeeId: data.employeeId },
    });

    if (existingTermination) {
      return NextResponse.json(
        { error: "Ya existe una desvinculación para este empleado" },
        { status: 400 }
      );
    }

    // Determinar estados iniciales basados en equipos asignados
    const hasNotebook = employee.assignments.some(
      (a) => a.asset.categoria.nombre.toLowerCase() === "notebook"
    );
    const hasCelular = employee.assignments.some(
      (a) => a.asset.categoria.nombre.toLowerCase() === "celular"
    );
    const hasMonitor = employee.assignments.some(
      (a) => a.asset.categoria.nombre.toLowerCase() === "monitor"
    );

    // Crear desvinculación
    const termination = await prisma.$transaction(async (tx) => {
      // Crear registro de desvinculación
      const newTermination = await tx.termination.create({
        data: {
          employeeId: data.employeeId,
          fechaDesvinculacion: data.fechaDesvinculacion,
          fechaDevolucionEquipos: data.fechaDevolucionEquipos,
          recibidoPor: data.recibidoPor,
          lugarDevolucion: data.lugarDevolucion,
          observaciones: data.observaciones,
          estadoNotebook: hasNotebook ? "pendiente" : "no_aplica",
          estadoCelular: hasCelular ? "pendiente" : "no_aplica",
          estadoMonitor: hasMonitor ? "pendiente" : "no_aplica",
          estadoKit: "pendiente", // Siempre pendiente, se revisa kit
        },
        include: {
          employee: {
            include: {
              assignments: {
                where: { activo: true },
                include: {
                  asset: {
                    include: { categoria: true },
                  },
                },
              },
            },
          },
        },
      });

      // Actualizar estado del empleado a desvinculado
      await tx.employee.update({
        where: { id: data.employeeId },
        data: {
          estado: "desvinculado",
          fechaTermino: data.fechaDesvinculacion,
        },
      });

      // Auditoria generica (SPEC 2.31): quien registro la desvinculacion.
      await auditLogService.registrarCreacion(
        'desvinculacion',
        newTermination.id,
        `Desvinculación registrada: ${employee.nombres} ${employee.apellidoPaterno}`,
        { employeeId: data.employeeId, fechaDesvinculacion: data.fechaDesvinculacion.toISOString() },
        session.user?.email,
        tx
      );

      return newTermination;
    });

    return NextResponse.json(termination, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear desvinculación');
  }
}
