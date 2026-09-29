import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { resumenMantenciones } from '@/modules/mantenciones/servidor';

// GET /api/mantenciones/pendientes - Contadores de las tarjetas de resumen de
// Mantenciones (SPEC 2.107).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;
    // dias=0 es "sin limite de fecha", distinto de no mandarlo (default 30).
    const resumen = await resumenMantenciones({
      dias: parseInt(searchParams.get("dias") || "30", 10),
      diasCompletadas: parseInt(searchParams.get("diasCompletadas") || "30", 10),
      sedeId: searchParams.get("sedeId"),
    });
    return NextResponse.json(resumen);
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones pendientes');
  }
}
