import { NextRequest, NextResponse } from "next/server";
import { employeeFiltersSchema } from "@/modules/personas";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { listarEmpleados } from '@/modules/personas/servidor';

// GET /api/empleados - Listar empleados con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    await requirePermission('empleados', 'read');

    const searchParams = request.nextUrl.searchParams;

    // Parsear y validar filtros
    const filtersResult = employeeFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      estado: searchParams.get("estado") || undefined,
      tipoContrato: searchParams.get("tipoContrato") || undefined,
      ubicacion: searchParams.get("ubicacion") || undefined,
      jefatura: searchParams.get("jefatura") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "nombres",
      sortOrder: searchParams.get("sortOrder") || "asc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    return NextResponse.json(await listarEmpleados(filtersResult.data, searchParams.get("sedeId")));
  } catch (error) {
    return handleApiError(error, 'Error al obtener empleados');
  }
}
