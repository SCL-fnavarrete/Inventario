import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { leerFiltrosLineas, lineaNuevaSchema } from '@/modules/lineas';
import { crearLinea, listarLineas } from '@/modules/lineas/servidor';

// Lineas telefonicas (SPEC 2.131). GET: los filtros de la pantalla (leerFiltrosLineas) y ?sedeId= (navbar).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('lineas', 'read');
    return NextResponse.json(await listarLineas(leerFiltrosLineas(request.nextUrl.searchParams)));
  } catch (error) {
    return handleApiError(error, 'Error al obtener líneas');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('lineas', 'write');
    const datos = lineaNuevaSchema.parse(await request.json());
    return NextResponse.json(await crearLinea(datos, quienHace(session)), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear línea');
  }
}
