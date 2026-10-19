import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/shared/auth/guard";
import { consultarAuditoria } from "@/modules/configuracion/servidor";
import { rangoDiasChile } from "@/shared/utilidades/fechas";
import { leerPaginacion } from "@/shared/utilidades/paginacion";

// Auditoria unificada (SPEC 2.112.8): los tres historiales (AuditLog,
// AssetHistory y WorkflowTransition) en una sola consulta, con paginas
// exactas y sin tope. Las fechas se filtran por dias de Chile ("hasta"
// incluye todo ese dia). Solo admin, asi que no hace falta aislar por sede.
// Filtros de visor de eventos (SPEC 2.170): usuario (su cuenta) y dias.
export async function GET(request: NextRequest) {
  try {
    await requirePermission("configuracion", "read");

    const p = request.nextUrl.searchParams;
    const { page, limit } = leerPaginacion(p, { limitPorDefecto: 20 });

    const { data, total } = await consultarAuditoria({
      usuario: p.get("usuario")?.trim() || "",
      rango: rangoDiasChile(p.get("fechaDesde"), p.get("fechaHasta")),
      page,
      limit,
    });

    return NextResponse.json({
      data,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    return handleApiError(error, "Error al obtener la auditoría");
  }
}
