import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { leerFiltrosActivos } from '@/modules/activos';
import { resumenActivos } from '@/modules/activos/servidor';

// Tarjetas de Activos: con los mismos filtros que la lista (SPEC 2.116.6).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('activos', 'read');
    return NextResponse.json(await resumenActivos(leerFiltrosActivos(request.nextUrl.searchParams)));
  } catch (error) {
    return handleApiError(error, 'Error al obtener estadísticas');
  }
}
