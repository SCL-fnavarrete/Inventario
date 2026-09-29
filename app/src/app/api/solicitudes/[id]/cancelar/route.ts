import { NextRequest, NextResponse } from 'next/server';
import { cancelWorkflowRequestSchema } from '@/modules/solicitudes';
import { requirePermission, handleApiError, respuestaDatosInvalidos, usuarioDeSesion } from '@/shared/auth/guard';
import { cancelarSolicitud } from '@/modules/solicitudes/servidor';
import { sinIdsDeUsuario } from '@/shared/utilidades/privacidad';

// POST /api/solicitudes/[id]/cancelar - Cancelar una solicitud que todavia no
// ejecuto nada sobre el inventario (ver cancelarSolicitud)
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const parsed = cancelWorkflowRequestSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const cancelada = await cancelarSolicitud(id, parsed.data, usuarioDeSesion(session));
    return NextResponse.json(sinIdsDeUsuario(cancelada));
  } catch (error) {
    return handleApiError(error, 'Error al cancelar solicitud');
  }
}
