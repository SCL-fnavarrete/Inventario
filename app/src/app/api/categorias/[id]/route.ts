import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { categoriaSchema } from '@/modules/activos';
import { editarCategoria, eliminarCategoria, obtenerCategoria } from '@/modules/activos/servidor';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission('categorias', 'read');
    const { id } = await params;
    return NextResponse.json(await obtenerCategoria(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener categoría');
  }
}

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('categorias', 'write');
    const { id } = await params;
    const datos = categoriaSchema.parse(await request.json());
    return NextResponse.json(await editarCategoria(id, datos, session.user?.email));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar categoría');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('categorias', 'delete');
    const { id } = await params;
    await eliminarCategoria(id, session.user?.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar categoría');
  }
}
