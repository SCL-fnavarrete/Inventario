import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { categoriaSchema } from '@/modules/activos';
import { crearCategoria, listarCategorias } from '@/modules/activos/servidor';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('categorias', 'read');
    const searchParams = request.nextUrl.searchParams;
    const categorias = await listarCategorias({
      conConteo: searchParams.get("includeCount") === "true",
      sedeId: searchParams.get("sedeId"),
    });
    return NextResponse.json(categorias);
  } catch (error) {
    return handleApiError(error, 'Error al obtener categorías');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('categorias', 'write');
    const categoria = await crearCategoria(categoriaSchema.parse(await request.json()), session.user?.email);
    return NextResponse.json(categoria, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear categoría');
  }
}
