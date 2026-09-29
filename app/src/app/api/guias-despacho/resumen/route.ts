import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { resumenDespachos } from '@/modules/despachos/servidor';

// GET /api/guias-despacho/resumen - Numeros de las tarjetas de Despachos (SPEC 2.108)
export async function GET(request: NextRequest) {
  try {
    await requirePermission('guias', 'read');
    return NextResponse.json(await resumenDespachos(request.nextUrl.searchParams.get("sedeId") || ""));
  } catch (error) {
    return handleApiError(error, 'Error al obtener el resumen de despachos');
  }
}
