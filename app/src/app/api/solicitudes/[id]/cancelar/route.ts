import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelWorkflowRequestSchema } from '@/lib/validations/workflow';
import { requirePermission, handleApiError, respuestaDatosInvalidos, ConflictError, usuarioDeSesion } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import { sinIdsDeUsuario } from '@/lib/utils/privacidad';

// POST /api/solicitudes/[id]/cancelar - Cancela una solicitud que todavia no
// ejecuto ningun efecto secundario sobre el inventario (assignmentIds y
// kitReturnIds vacios). No pasa por workflowStateMachine.canTransition
// porque no es un paso mas del flujo, sino que el ticket nunca debio
// existir o ya no corresponde.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = cancelWorkflowRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }
    const { motivo } = validationResult.data;

    const systemUser = usuarioDeSesion(session);

    const workflowRequest = await prisma.workflowRequest.findUnique({ where: { id } });
    if (!workflowRequest) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    assertSedeAccess(session, workflowRequest.sedeId, 'Solicitud no encontrada');

    if (workflowRequest.fechaCierre) {
      return NextResponse.json(
        { error: 'Esta solicitud ya está cerrada, no se puede cancelar' },
        { status: 409 }
      );
    }

    // Si ya ejecuto algo (asigno/devolvio un activo, entrego kit/EPP), ya no
    // es un simple "este ticket no debia existir": cancelar aca dejaria el
    // inventario inconsistente (activo reservado/entregado sin que nada lo
    // refleje). Hay que revertir esas acciones a mano antes de cerrarla.
    if (workflowRequest.assignmentIds.length > 0 || workflowRequest.kitReturnIds.length > 0) {
      return NextResponse.json(
        {
          error:
            'Esta solicitud ya ejecutó acciones sobre el inventario (asignó o devolvió equipo/EPP); no se puede cancelar directamente. Revierte esas acciones primero.',
        },
        { status: 409 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      // Misma condicion que se valido arriba: si otra persona la avanzo o le
      // ejecuto acciones en el intertanto, no se cancela a ciegas (R1).
      const { count } = await tx.workflowRequest.updateMany({
        where: { id, updatedAt: workflowRequest.updatedAt, fechaCierre: null },
        data: { updatedAt: new Date() },
      });
      if (count !== 1) {
        throw new ConflictError('La solicitud cambió mientras la cancelabas. Recarga la página y revisa su estado.');
      }

      const cancelada = await tx.workflowRequest.update({
        where: { id },
        data: {
          estado: 'cancelada',
          fechaCierre: new Date(),
        },
        include: {
          employee: true,
          solicitante: { select: { nombre: true, rol: true } },
          responsableActual: { select: { nombre: true, rol: true } },
        },
      });

      await tx.workflowTransition.create({
        data: {
          requestId: id,
          estadoAnterior: workflowRequest.estado,
          estadoNuevo: 'cancelada',
          ejecutadoPorId: systemUser.id,
          comentario: `Cancelada: ${motivo}`,
        },
      });

      return cancelada;
    });

    return NextResponse.json(sinIdsDeUsuario(result));
  } catch (error) {
    return handleApiError(error, 'Error al cancelar solicitud');
  }
}
