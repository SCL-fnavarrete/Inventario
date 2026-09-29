import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { crearUsuarioSchema } from '@/modules/configuracion';
import { crearUsuario, listarUsuarios } from '@/modules/configuracion/servidor';

export async function GET() {
  try {
    await requirePermission('usuarios', 'read');
    return NextResponse.json(await listarUsuarios());
  } catch (error) {
    return handleApiError(error, 'Error al obtener usuarios');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('usuarios', 'write');
    const user = await crearUsuario(crearUsuarioSchema.parse(await request.json()), session.user?.email);
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear usuario');
  }
}
