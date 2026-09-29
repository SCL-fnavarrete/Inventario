import { NextRequest, NextResponse } from 'next/server';
import { createWorkflowRequestSchema, workflowFiltersSchema } from '@/modules/solicitudes';
import { crearSolicitud, listarSolicitudes } from '@/modules/solicitudes/servidor';
import { requirePermission, handleApiError, respuestaDatosInvalidos, usuarioDeSesion } from '@/shared/auth/guard';
import { sinIdsDeUsuario } from '@/shared/utilidades/privacidad';

// GET /api/solicitudes - List with filters
export async function GET(request: NextRequest) {

  try {
    await requirePermission('solicitudes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const filtersResult = workflowFiltersSchema.safeParse({
      search: searchParams.get('search') || undefined,
      tipo: searchParams.get('tipo') || undefined,
      estado: searchParams.get('estado') || undefined,
      responsableActualId: searchParams.get('responsableActualId') || undefined,
      fechaDesde: searchParams.get('fechaDesde') || undefined,
      fechaHasta: searchParams.get('fechaHasta') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 10,
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const resultado = await listarSolicitudes(filtersResult.data, searchParams.get("sedeId"));
    return NextResponse.json(sinIdsDeUsuario(resultado));
  } catch (error) {
    return handleApiError(error, 'Error al obtener solicitudes');
  }
}

// POST /api/solicitudes - Crear una solicitud (se crea y se cierra en el
// mismo formulario, SPEC 2.82).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const body = await request.json();
    const parsed = createWorkflowRequestSchema.safeParse(body);
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const result = await crearSolicitud(
      parsed.data,
      (body as { sedeId?: string }).sedeId,
      usuarioDeSesion(session)
    );
    return NextResponse.json(sinIdsDeUsuario(result), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear solicitud');
  }
}
