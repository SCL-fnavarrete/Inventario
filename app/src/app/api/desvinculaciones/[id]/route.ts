import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateTerminationSchema, registerReturnSchema } from "@/lib/validations/termination";

// GET /api/desvinculaciones/[id] - Obtener detalle de desvinculación
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const termination = await prisma.termination.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            assignments: {
              include: {
                asset: {
                  include: { categoria: true },
                },
              },
              orderBy: { fechaEntrega: "desc" },
            },
            kitAssignments: {
              include: { item: true },
            },
          },
        },
      },
    });

    if (!termination) {
      return NextResponse.json(
        { error: "Desvinculación no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(termination);
  } catch (error) {
    console.error("Error fetching termination:", error);
    return NextResponse.json(
      { error: "Error al obtener desvinculación" },
      { status: 500 }
    );
  }
}

// PUT /api/desvinculaciones/[id] - Actualizar desvinculación
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateTerminationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que existe la desvinculación
    const existingTermination = await prisma.termination.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            assignments: {
              where: { activo: true },
              include: {
                asset: { include: { categoria: true } },
              },
            },
          },
        },
      },
    });

    if (!existingTermination) {
      return NextResponse.json(
        { error: "Desvinculación no encontrada" },
        { status: 404 }
      );
    }

    // Actualizar desvinculación
    const termination = await prisma.termination.update({
      where: { id },
      data: {
        ...(data.fechaDevolucionEquipos !== undefined && {
          fechaDevolucionEquipos: data.fechaDevolucionEquipos,
        }),
        ...(data.estadoNotebook && { estadoNotebook: data.estadoNotebook }),
        ...(data.estadoCelular && { estadoCelular: data.estadoCelular }),
        ...(data.estadoMonitor && { estadoMonitor: data.estadoMonitor }),
        ...(data.estadoKit && { estadoKit: data.estadoKit }),
        ...(data.recibidoPor !== undefined && { recibidoPor: data.recibidoPor }),
        ...(data.lugarDevolucion !== undefined && { lugarDevolucion: data.lugarDevolucion }),
        ...(data.requiereDescuento !== undefined && { requiereDescuento: data.requiereDescuento }),
        ...(data.montoDescuento !== undefined && { montoDescuento: data.montoDescuento }),
        ...(data.motivoDescuento !== undefined && { motivoDescuento: data.motivoDescuento }),
        ...(data.notificadoRrhh !== undefined && {
          notificadoRrhh: data.notificadoRrhh,
          ...(data.notificadoRrhh && { fechaNotificacionRrhh: new Date() }),
        }),
        ...(data.observaciones !== undefined && { observaciones: data.observaciones }),
      },
      include: {
        employee: {
          include: {
            assignments: {
              where: { activo: true },
              include: {
                asset: { include: { categoria: true } },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(termination);
  } catch (error) {
    console.error("Error updating termination:", error);
    return NextResponse.json(
      { error: "Error al actualizar desvinculación" },
      { status: 500 }
    );
  }
}

// DELETE /api/desvinculaciones/[id] - Eliminar desvinculación (solo si no hay equipos devueltos)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const termination = await prisma.termination.findUnique({
      where: { id },
      include: { employee: true },
    });

    if (!termination) {
      return NextResponse.json(
        { error: "Desvinculación no encontrada" },
        { status: 404 }
      );
    }

    // Verificar que no se hayan procesado devoluciones
    const hasProcessedReturns =
      termination.estadoNotebook !== "pendiente" ||
      termination.estadoCelular !== "pendiente" ||
      termination.estadoMonitor !== "pendiente" ||
      termination.estadoKit !== "pendiente";

    if (hasProcessedReturns) {
      return NextResponse.json(
        { error: "No se puede eliminar una desvinculación con devoluciones procesadas" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      // Restaurar estado del empleado
      await tx.employee.update({
        where: { id: termination.employeeId },
        data: {
          estado: "activo",
          fechaTermino: null,
        },
      });

      // Eliminar desvinculación
      await tx.termination.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: "Desvinculación eliminada" });
  } catch (error) {
    console.error("Error deleting termination:", error);
    return NextResponse.json(
      { error: "Error al eliminar desvinculación" },
      { status: 500 }
    );
  }
}
