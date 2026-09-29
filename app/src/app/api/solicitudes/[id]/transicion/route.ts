import { NextRequest, NextResponse } from 'next/server';
import { transitionSchema } from '@/modules/solicitudes/validaciones';
import { aplicarTransicion } from '@/modules/solicitudes/transicion';
import {
  requirePermission,
  handleApiError,
  respuestaDatosInvalidos,
  usuarioDeSesion,
} from '@/shared/auth/guard';
import { sinIdsDeUsuario } from '@/shared/utilidades/privacidad';

// POST /api/solicitudes/[id]/transicion - Avanzar una solicitud de estado.
// Quien puede hacer cada transicion lo decide canTransition, no la matriz.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const parsed = transitionSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const result = await aplicarTransicion(id, parsed.data, usuarioDeSesion(session));
    return NextResponse.json(sinIdsDeUsuario(result));
  } catch (error) {
    return handleApiError(error, 'Error al avanzar solicitud');
  }
}
