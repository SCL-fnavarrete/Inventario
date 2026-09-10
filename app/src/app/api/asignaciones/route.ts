import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAssignmentSchema, assignmentFiltersSchema } from "@/lib/validations/assignment";
import { executeAssignment } from "@/lib/services/workflowExecutionService";
import { Prisma } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere, assertSedeAccess } from '@/lib/auth/sedeScope';

export const dynamic = 'force-dynamic';


// GET /api/asignaciones - Listar asignaciones con filtros
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('asignaciones', 'read');

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
      return NextResponse.json(
        { error: "Parámetros inválidos", details: filtersResult.error.issues },
        { status: 400 }
      );
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Assignment no tiene sedeId propio -- se filtra via su relacion al
    // activo (mismo criterio que Mantenciones y que el Dashboard).
    const where: Prisma.AssignmentWhereInput = {
      asset: sedeWhere(session),
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

    if (filters.search) {
      where.OR = [
        { employee: { rut: { contains: filters.search, mode: "insensitive" } } },
        { employee: { nombres: { contains: filters.search, mode: "insensitive" } } },
        { employee: { apellidoPaterno: { contains: filters.search, mode: "insensitive" } } },
        { asset: { numeroSerie: { contains: filters.search, mode: "insensitive" } } },
        { asset: { marca: { contains: filters.search, mode: "insensitive" } } },
        { asset: { modelo: { contains: filters.search, mode: "insensitive" } } },
      ];
    }

    const [assignments, total] = await Promise.all([
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
    const session = await requirePermission('asignaciones', 'write');

    const body = await request.json();

    const validationResult = createAssignmentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Un tecnico no debe poder asignar un activo o un empleado de otra
    // sede aunque conozca el id -- executeAssignment no valida esto (es
    // compartido con el flujo de Solicitudes, que ya valida sede mas
    // arriba), asi que se verifica aca antes de ejecutar.
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
    assertSedeAccess(session, assetParaAsignar.sedeId, 'Activo no encontrado');
    assertSedeAccess(session, employeeParaAsignar.sedeId, 'Empleado no encontrado');

    // Crear asignación y actualizar activo en una transacción usando servicio compartido
    const result = await prisma.$transaction(async (tx) => {
      return executeAssignment(tx, {
        assetId: data.assetId,
        employeeId: data.employeeId,
        fechaEntrega: data.fechaEntrega,
        lugarEntrega: data.lugarEntrega,
        entregadoPor: data.entregadoPor,
        tipoMovimiento: data.tipoMovimiento,
        motivo: data.motivo,
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear asignación');
  }
}
