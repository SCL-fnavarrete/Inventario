import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/prisma';
import { updatePendienteSchema } from '@/modules/solicitudes/validaciones';
import { requirePermission, handleApiError, usuarioDeSesion } from '@/shared/auth/guard';

// PATCH /api/solicitudes/[id]/pendientes/[pendienteId] - Update pendiente status
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pendienteId: string }> }
) {

  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id, pendienteId } = await params;
    const body = await request.json();

    const validationResult = updatePendienteSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    // Verify the pendiente belongs to the request
    const pendiente = await prisma.workflowPendiente.findFirst({
      where: { id: pendienteId, requestId: id },
      include: { request: { select: { sedeId: true } } },
    });
    if (!pendiente) {
      return NextResponse.json({ error: 'Pendiente no encontrado' }, { status: 404 });
    }

    const systemUser = usuarioDeSesion(session);

    const data = validationResult.data;
    const updated = await prisma.workflowPendiente.update({
      where: { id: pendienteId },
      data: {
        estado: data.estado,
        descripcion: data.descripcion !== undefined ? data.descripcion : undefined,
        actualizadoPor: systemUser?.nombre || session.user?.name || 'Sistema',
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar pendiente');
  }
}
