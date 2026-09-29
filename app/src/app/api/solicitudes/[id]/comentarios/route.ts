import { NextRequest, NextResponse } from 'next/server';
import { createCommentSchema } from '@/modules/solicitudes';
import { requirePermission, handleApiError, respuestaDatosInvalidos, usuarioDeSesion } from '@/shared/auth/guard';
import { comentarSolicitud } from '@/modules/solicitudes/servidor';
import { sinIdsDeUsuario } from '@/shared/utilidades/privacidad';

// POST /api/solicitudes/[id]/comentarios - Agregar un comentario
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const parsed = createCommentSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const comentario = await comentarSolicitud(id, parsed.data, usuarioDeSesion(session));
    return NextResponse.json(sinIdsDeUsuario(comentario), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al agregar comentario');
  }
}
