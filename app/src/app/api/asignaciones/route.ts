import { NextRequest, NextResponse } from "next/server";
import { createAssignmentSchema, assignmentFiltersSchema } from "@/modules/asignaciones";
import { asignarEquipo, listarAsignaciones, listarAsignacionesConLineas } from "@/modules/asignaciones/servidor";
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';

export const dynamic = 'force-dynamic';

// GET /api/asignaciones - Listar asignaciones con filtros
export async function GET(request: NextRequest) {
  try {
    await requirePermission('asignaciones', 'read');

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = assignmentFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      employeeId: searchParams.get("employeeId") || undefined,
      assetId: searchParams.get("assetId") || undefined,
      activo: searchParams.get("activo") || undefined,
      tipoMovimiento: searchParams.get("tipoMovimiento") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "fechaEntrega",
      sortOrder: searchParams.get("sortOrder") || "desc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    // La tabla de Activos > Asignaciones trae tambien las lineas (SPEC 2.143).
    const conLineas = searchParams.get("incluirLineas") === "true";
    if (conLineas) await requirePermission('lineas', 'read');
    const resultado = conLineas
      ? await listarAsignacionesConLineas(filtersResult.data, searchParams.get("sedeId"))
      : await listarAsignaciones(filtersResult.data, searchParams.get("sedeId"));
    return NextResponse.json(resultado, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    return handleApiError(error, 'Error al obtener asignaciones');
  }
}

// POST /api/asignaciones - Crear nueva asignacion
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('asignaciones', 'write');

    const body = await request.json();

    const validationResult = createAssignmentSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    return NextResponse.json(await asignarEquipo(validationResult.data, quienHace(session)), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear asignación');
  }
}
