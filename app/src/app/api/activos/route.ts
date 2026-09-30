import { NextRequest, NextResponse } from "next/server";
import { leerPaginacion } from "@/shared/utilidades/paginacion";
import { createAssetSchema, leerFiltrosActivos } from "@/modules/activos";
import { listarActivos, registrarActivo } from "@/modules/activos/servidor";
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';

/**
 * Tope de filas por pagina. Protege la base de un ?limit arbitrario;
 * 500 alcanza para las pantallas que traen una lista completa de una vez.
 */
const LIMITE_MAXIMO_PAGINA = 500;

export async function GET(request: NextRequest) {
  try {
    await requirePermission('activos', 'read');
    const searchParams = request.nextUrl.searchParams;
    // Los mismos filtros que la exportacion y las tarjetas (SPEC 2.116.6).
    const resultado = await listarActivos(
      { ...leerFiltrosActivos(searchParams), empleadoActualId: searchParams.get("empleadoActualId") || "" },
      leerPaginacion(searchParams, { limitMaximo: LIMITE_MAXIMO_PAGINA })
    );
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error, 'Error al obtener activos');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');
    const body = await request.json();
    const asset = await registrarActivo(
      createAssetSchema.parse(body),
      (body as { sedeId?: string }).sedeId,
      quienHace(session)
    );
    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear activo');
  }
}
