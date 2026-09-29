import { NextRequest, NextResponse } from "next/server";
import { createMaintenanceSchema, maintenanceFiltersSchema } from "@/modules/mantenciones";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { listarMantenciones, programarMantencion } from "@/modules/mantenciones/servidor";

// GET /api/mantenciones - Listar mantenciones con filtros
export async function GET(request: NextRequest) {
  try {
    await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;
    const parsed = maintenanceFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      assetId: searchParams.get("assetId") || undefined,
      tipoId: searchParams.get("tipoId") || undefined,
      estado: searchParams.get("estado") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      pendientes: searchParams.get("pendientes") || undefined,
      vencidas: searchParams.get("vencidas") || undefined,
      vista: searchParams.get("vista") || undefined,
      dias: searchParams.get("dias") || undefined,
      diasCompletadas: searchParams.get("diasCompletadas") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || undefined,
      sortOrder: searchParams.get("sortOrder") || "asc",
    });
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await listarMantenciones(parsed.data, searchParams.get("sedeId")));
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones');
  }
}

// POST /api/mantenciones - Programar una mantención
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const parsed = createMaintenanceSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const mantencion = await programarMantencion(parsed.data, session.user?.email);
    return NextResponse.json(mantencion, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear mantención');
  }
}
