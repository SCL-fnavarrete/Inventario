import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { returnMultipleAssignmentsSchema } from '@/lib/validations/assignment';
import { executeReturn } from '@/lib/services/workflowExecutionService';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

/** One atomic official return act. It intentionally replaces client-side N PUTs. */
export async function POST(request: NextRequest) {
  try {
    await requirePermission('asignaciones', 'write');
    const validation = returnMultipleAssignmentsSchema.safeParse(await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: validation.error.issues }, { status: 400 });
    }
    const data = validation.data;
    const result = await prisma.$transaction(async (tx) => {
      const eventTimestamp = new Date();
      const returns = [];
      for (const assignmentId of data.assignmentIds) {
        const returned = await executeReturn(tx, {
          assignmentId,
          fechaDevolucion: data.fechaDevolucion,
          recibidoPor: data.recibidoPor,
          estadoDevolucion: data.estadoDevolucion,
          observacionesDevolucion: data.observacionesDevolucion,
          firmaEmpleadoDevolucion: data.firmaEmpleadoDevolucion,
          aceptaPoliticaUso: data.aceptaPoliticaUso,
        }, { eventTimestamp, expectedEmployeeId: data.employeeId });
        returns.push(returned);
      }
      return {
        assignments: returns.map((returned) => returned.assignment),
        evidenciasParaDocumento: returns.map((returned) => returned.evidenciaParaDocumento),
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al registrar devolución por lote');
  }
}
