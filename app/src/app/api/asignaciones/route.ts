import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAssignmentSchema, assignmentFiltersSchema } from "@/lib/validations/assignment";
import { Prisma } from "@prisma/client";

// GET /api/asignaciones - Listar asignaciones con filtros
export async function GET(request: NextRequest) {
  try {
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

    const where: Prisma.AssignmentWhereInput = {};

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
    });
  } catch (error) {
    console.error("Error fetching assignments:", error);
    return NextResponse.json(
      { error: "Error al obtener asignaciones" },
      { status: 500 }
    );
  }
}

// POST /api/asignaciones - Crear nueva asignación
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = createAssignmentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que el activo existe y está disponible
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

    if (asset.estado !== "disponible" && asset.estado !== "reutilizable") {
      return NextResponse.json(
        { error: `El activo no está disponible. Estado actual: ${asset.estado}` },
        { status: 400 }
      );
    }

    // Verificar que el empleado existe y está activo
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });

    if (!employee) {
      return NextResponse.json(
        { error: "Empleado no encontrado" },
        { status: 404 }
      );
    }

    if (employee.estado !== "activo") {
      return NextResponse.json(
        { error: "El empleado no está activo" },
        { status: 400 }
      );
    }

    // Crear asignación y actualizar activo en una transacción
    const result = await prisma.$transaction(async (tx) => {
      // Crear asignación
      const assignment = await tx.assignment.create({
        data: {
          assetId: data.assetId,
          employeeId: data.employeeId,
          fechaEntrega: data.fechaEntrega,
          lugarEntrega: data.lugarEntrega,
          entregadoPor: data.entregadoPor,
          tipoMovimiento: data.tipoMovimiento,
          motivo: data.motivo,
          activo: true,
        },
        include: {
          asset: {
            include: { categoria: true },
          },
          employee: true,
        },
      });

      // Actualizar estado del activo
      await tx.asset.update({
        where: { id: data.assetId },
        data: {
          estado: "asignado",
          empleadoActualId: data.employeeId,
        },
      });

      // Registrar en historial
      await tx.assetHistory.create({
        data: {
          assetId: data.assetId,
          tipoEvento: "asignacion",
          descripcion: `Asignado a ${employee.nombres} ${employee.apellidoPaterno} (${employee.rut})`,
          datosAnteriores: { estado: asset.estado, empleadoActualId: asset.empleadoActualId },
          datosNuevos: { estado: "asignado", empleadoActualId: data.employeeId },
          usuarioSistema: data.entregadoPor || "Sistema",
        },
      });

      return assignment;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    console.error("Error creating assignment:", error);
    return NextResponse.json(
      { error: "Error al crear asignación" },
      { status: 500 }
    );
  }
}
