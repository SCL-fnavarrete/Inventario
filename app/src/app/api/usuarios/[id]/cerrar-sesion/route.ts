import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { cerrarSesionUsuario } from '@/modules/configuracion/servidor';

type Params = { params: Promise<{ id: string }> };

// POST /api/usuarios/[id]/cerrar-sesion - Un administrador cierra la sesion de
// un usuario (SPEC 2.127): sale en su siguiente accion; no se desactiva.
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('usuarios', 'write');
    const { id } = await params;
    return NextResponse.json(await cerrarSesionUsuario(id, { id: session.user.id, usuario: quienHace(session) }));
  } catch (error) {
    return handleApiError(error, 'Error al cerrar la sesión');
  }
}
