import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { editarUsuarioSchema } from '@/modules/configuracion';
import { editarUsuario, obtenerUsuario } from '@/modules/configuracion/servidor';

// Un usuario no se elimina: se desactiva (SPEC 2.112).
type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission('usuarios', 'read');
    const { id } = await params;
    return NextResponse.json(await obtenerUsuario(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener usuario');
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('usuarios', 'write');
    const { id } = await params;
    const datos = editarUsuarioSchema.parse(await request.json());
    const user = await editarUsuario(id, datos, { id: session.user.id, email: session.user?.email });
    return NextResponse.json(user);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar usuario');
  }
}
