import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updatePendienteSchema } from '@/lib/validations/workflow';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

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
    });
    if (!pendiente) {
      return NextResponse.json({ error: 'Pendiente no encontrado' }, { status: 404 });
    }

    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });

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
