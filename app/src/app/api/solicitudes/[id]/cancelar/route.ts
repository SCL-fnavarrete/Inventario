import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cancelWorkflowRequestSchema } from '@/lib/validations/workflow';
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';

// POST /api/solicitudes/[id]/cancelar - Cancela una solicitud que todavia no
// ejecuto ningun efecto secundario sobre el inventario (assignmentIds y
// kitReturnIds vacios). No es una transicion del flujo normal -- no pasa por
// workflowStateMachine.canTransition -- porque aplica a los tres tipos por
// igual y no representa un paso mas del proceso, sino que el ticket nunca
// debio existir o ya no corresponde (duplicado, error, ya no aplica). Ver
// SPEC 2.5.2/2.5.3 (v1.4).
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
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }
    const { motivo } = validationResult.data;

    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

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
      const cancelada = await tx.workflowRequest.update({
        where: { id },
        data: {
          estado: 'cancelada',
          fechaCierre: new Date(),
        },
        include: {
          employee: true,
          solicitante: { select: { id: true, nombre: true, rol: true } },
          responsableActual: { select: { id: true, nombre: true, rol: true } },
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

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al cancelar solicitud');
  }
}
