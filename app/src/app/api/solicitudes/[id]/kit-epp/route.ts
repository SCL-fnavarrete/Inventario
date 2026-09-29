import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, usuarioDeSesion } from '@/shared/auth/guard';
import { entregarKitItemsSchema, marcarKitItemNoAplicaSchema } from '@/modules/kit-epp';
import { entregarKitSolicitud, marcarKitNoAplica } from '@/modules/solicitudes/servidor';

type Params = { params: Promise<{ id: string }> };

// POST /api/solicitudes/[id]/kit-epp - Entregar Kit de Bienvenida / EPP de un onboarding
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const datos = entregarKitItemsSchema.parse(await request.json());
    const resultado = await entregarKitSolicitud(id, datos, usuarioDeSesion(session));
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al entregar Kit de Bienvenida / EPP');
  }
}

// PATCH /api/solicitudes/[id]/kit-epp - Marcar un articulo requerido como "No aplica"
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const datos = marcarKitItemNoAplicaSchema.parse(await request.json());
    return NextResponse.json(await marcarKitNoAplica(id, datos, usuarioDeSesion(session)));
  } catch (error) {
    return handleApiError(error, 'Error al marcar artículo como no aplica');
  }
}
