import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerReturnSchema } from "@/lib/validations/termination";
import { executeTerminationReturn } from "@/lib/services/workflowExecutionService";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// POST /api/desvinculaciones/[id]/procesar-devolucion - Procesar devolución de equipos
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('desvinculaciones', 'write');
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

    // Procesar devolución en transacción usando servicio compartido
    const result = await prisma.$transaction(async (tx) => {
      const eventTimestamp = new Date();
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
        firmaEmpleadoDevolucion: data.firmaEmpleadoDevolucion,
        aceptaPoliticaUso: data.aceptaPoliticaUso,
      }, { eventTimestamp });
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al procesar devolución');
  }
}
