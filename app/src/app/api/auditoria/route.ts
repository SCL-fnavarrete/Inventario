import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, ValidationError } from "@/lib/auth/guard";
import { consultarAuditoria } from "@/lib/services/auditoriaService";
import { MODULOS_AUDITORIA } from "@/lib/constants/auditoria";
import { rangoDiasChile } from "@/lib/utils/fechas";

// Auditoria unificada (SPEC 2.112.8): los tres historiales (AuditLog,
// AssetHistory y WorkflowTransition) en una sola consulta, con paginas
// exactas y sin tope. Las fechas se filtran por dias de Chile ("hasta"
// incluye todo ese dia). Solo admin, asi que no hace falta aislar por sede.
export async function GET(request: NextRequest) {
  try {
    await requirePermission("configuracion", "read");

    const p = request.nextUrl.searchParams;
    const modulo = p.get("modulo") || "";
    if (modulo && !MODULOS_AUDITORIA[modulo]) throw new ValidationError("Módulo desconocido");
    const page = Math.max(1, parseInt(p.get("page") || "1", 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(p.get("limit") || "20", 10) || 20));

    const { data, total } = await consultarAuditoria({
      modulo,
      usuario: p.get("usuario")?.trim() || "",
      search: p.get("search")?.trim() || "",
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
