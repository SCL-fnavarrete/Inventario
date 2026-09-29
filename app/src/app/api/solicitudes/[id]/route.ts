import { NextRequest, NextResponse } from 'next/server';
import { updateWorkflowRequestSchema } from '@/modules/solicitudes';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { actualizarSolicitud, detalleSolicitud } from '@/modules/solicitudes/servidor';
import { sinIdsDeUsuario } from '@/shared/utilidades/privacidad';

type Params = { params: Promise<{ id: string }> };

// GET /api/solicitudes/[id] - Detalle completo de una solicitud
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission('solicitudes', 'read');
    const { id } = await params;
    return NextResponse.json(sinIdsDeUsuario(await detalleSolicitud(id)));
  } catch (error) {
    return handleApiError(error, 'Error al obtener solicitud');
  }
}

// PATCH /api/solicitudes/[id] - Cambiar responsable u observaciones
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const parsed = updateWorkflowRequestSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(sinIdsDeUsuario(await actualizarSolicitud(id, parsed.data)));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar solicitud');
  }
}
