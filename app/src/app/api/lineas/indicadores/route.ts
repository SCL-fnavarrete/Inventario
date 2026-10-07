import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { leerFiltrosLineas } from '@/modules/lineas';
import { indicadoresLineas } from '@/modules/lineas/servidor';

// GET: panel de Activos > Lineas (SPEC 2.131), con los mismos filtros de la lista.
export async function GET(request: NextRequest) {
  try {
    await requirePermission('lineas', 'read');
    return NextResponse.json(await indicadoresLineas(leerFiltrosLineas(request.nextUrl.searchParams)));
  } catch (error) {
    return handleApiError(error, 'Error al obtener los indicadores de líneas');
  }
}
