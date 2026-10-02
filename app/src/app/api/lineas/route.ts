import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { lineaSchema } from '@/modules/lineas';
import { crearLinea, listarLineas } from '@/modules/lineas/servidor';

// Lineas telefonicas (SPEC 2.131). GET: ?estado=activa|baja y ?q= para buscar.
export async function GET(request: NextRequest) {
  try {
    await requirePermission('lineas', 'read');
    const p = request.nextUrl.searchParams;
    return NextResponse.json(await listarLineas({ estado: p.get('estado'), busqueda: p.get('q') }));
  } catch (error) {
    return handleApiError(error, 'Error al obtener líneas');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('lineas', 'write');
    const datos = lineaSchema.parse(await request.json());
    return NextResponse.json(await crearLinea(datos, quienHace(session)), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear línea');
  }
}
