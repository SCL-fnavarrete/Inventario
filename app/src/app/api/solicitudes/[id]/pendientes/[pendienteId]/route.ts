import { NextRequest, NextResponse } from 'next/server';
import { updatePendienteSchema } from '@/modules/solicitudes';
import { requirePermission, handleApiError, usuarioDeSesion } from '@/shared/auth/guard';
import { actualizarPendiente } from '@/modules/solicitudes/servidor';

// PATCH /api/solicitudes/[id]/pendientes/[pendienteId] - Actualizar un pendiente
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; pendienteId: string }> }
) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id, pendienteId } = await params;
    const parsed = updatePendienteSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: 'Datos inválidos', details: parsed.error.issues }, { status: 400 });
    }
    const quien = usuarioDeSesion(session)?.nombre || session.user?.name || 'Sistema';
    return NextResponse.json(await actualizarPendiente(id, pendienteId, parsed.data, quien));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar pendiente');
  }
}
