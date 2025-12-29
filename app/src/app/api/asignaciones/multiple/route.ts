import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createMultipleAssignmentsSchema } from "@/lib/validations/assignment";

// POST /api/asignaciones/multiple - Crear múltiples asignaciones (varios activos a un empleado)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = createMultipleAssignmentsSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

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

    // Verificar que todos los activos existen y están disponibles
    const assets = await prisma.asset.findMany({
      where: {
        id: { in: data.assetIds },
      },
      include: { categoria: true },
    });

    if (assets.length !== data.assetIds.length) {
      return NextResponse.json(
        { error: "Algunos activos no fueron encontrados" },
        { status: 404 }
      );
    }

    const notAvailable = assets.filter(
      (a) => a.estado !== "disponible" && a.estado !== "reutilizable"
    );

    if (notAvailable.length > 0) {
      return NextResponse.json(
        {
          error: "Algunos activos no están disponibles",
          details: notAvailable.map((a) => ({
            id: a.id,
            serie: a.numeroSerie,
            estado: a.estado,
          })),
        },
        { status: 400 }
      );
    }

    // Crear asignaciones en una transacción
    const result = await prisma.$transaction(async (tx) => {
      const assignments = [];

      for (const asset of assets) {
        // Crear asignación
        const assignment = await tx.assignment.create({
          data: {
            assetId: asset.id,
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
          where: { id: asset.id },
          data: {
            estado: "asignado",
            empleadoActualId: data.employeeId,
          },
        });

        // Registrar en historial
        await tx.assetHistory.create({
          data: {
            assetId: asset.id,
            tipoEvento: "asignacion",
            descripcion: `Asignado a ${employee.nombres} ${employee.apellidoPaterno} (${employee.rut})`,
            datosAnteriores: { estado: asset.estado, empleadoActualId: asset.empleadoActualId },
            datosNuevos: { estado: "asignado", empleadoActualId: data.employeeId },
            usuarioSistema: data.entregadoPor || "Sistema",
          },
        });

        assignments.push(assignment);
      }

      return assignments;
    });

    return NextResponse.json({
      message: `Se asignaron ${result.length} equipos correctamente`,
      assignments: result,
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating multiple assignments:", error);
    return NextResponse.json(
      { error: "Error al crear asignaciones" },
      { status: 500 }
    );
  }
}
