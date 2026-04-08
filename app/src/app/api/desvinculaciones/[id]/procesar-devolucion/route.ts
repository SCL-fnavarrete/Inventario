import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerReturnSchema } from "@/lib/validations/termination";
import { executeTerminationReturn } from "@/lib/services/workflowExecutionService";

// POST /api/desvinculaciones/[id]/procesar-devolucion - Procesar devolución de equipos
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validationResult = registerReturnSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que existe la desvinculación
    const termination = await prisma.termination.findUnique({
      where: { id },
    });

    if (!termination) {
      return NextResponse.json(
        { error: "Desvinculación no encontrada" },
        { status: 404 }
      );
    }

    // Procesar devolución en transacción usando servicio compartido
    await prisma.$transaction(async (tx) => {
      return executeTerminationReturn(tx, {
        terminationId: id,
        fechaDevolucionEquipos: data.fechaDevolucionEquipos,
        estadoNotebook: data.estadoNotebook,
        estadoCelular: data.estadoCelular,
        estadoMonitor: data.estadoMonitor,
        estadoKit: data.estadoKit,
        recibidoPor: data.recibidoPor,
        lugarDevolucion: data.lugarDevolucion,
        requiereDescuento: data.requiereDescuento,
        montoDescuento: data.montoDescuento,
        motivoDescuento: data.motivoDescuento,
        observaciones: data.observaciones,
      });
    });

    // Recargar con todas las relaciones
    const finalTermination = await prisma.termination.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            assignments: {
              include: {
                asset: { include: { categoria: true } },
              },
              orderBy: { fechaEntrega: "desc" },
            },
          },
        },
      },
    });

    return NextResponse.json(finalTermination);
  } catch (error) {
    console.error("Error processing return:", error);
    return NextResponse.json(
      { error: "Error al procesar devolución" },
      { status: 500 }
    );
  }
}
