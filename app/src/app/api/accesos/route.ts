import { NextRequest, NextResponse } from "next/server";
import { leerPaginacion } from "@/shared/utilidades/paginacion";
import { requirePermission, handleApiError } from "@/shared/auth/guard";
import { listarAccesos } from "@/modules/configuracion/servidor";

// GET /api/accesos?usuario=&resultado=&fechaDesde=&fechaHasta=&vista=&page=&limit=
// Registro de accesos (SPEC 2.112, solo admin).
export async function GET(request: NextRequest) {
  try {
    await requirePermission("configuracion", "read");
    const p = request.nextUrl.searchParams;
    const resultado = await listarAccesos({
      usuario: p.get("usuario")?.trim() || "",
      resultado: p.get("resultado"),
      fechaDesde: p.get("fechaDesde"),
      fechaHasta: p.get("fechaHasta"),
      vista: p.get("vista") || "",
      ...leerPaginacion(p, { limitPorDefecto: 25 }),
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error, "Error al obtener el registro de accesos");
  }
}
