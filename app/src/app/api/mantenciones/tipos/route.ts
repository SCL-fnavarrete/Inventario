import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { createMaintenanceTypeSchema } from '@/modules/mantenciones';
import { crearTipoMantencion, listarTiposMantencion } from '@/modules/mantenciones/servidor';

// GET /api/mantenciones/tipos - Listar tipos de mantención (catalogo global)
export async function GET(request: NextRequest) {
  try {
    await requirePermission('tiposMantencion', 'read');
    const searchParams = request.nextUrl.searchParams;
    const tipos = await listarTiposMantencion({
      soloActivos: searchParams.get('activo') === 'true',
      conConteo: searchParams.get('includeCount') === 'true',
    });
    return NextResponse.json(tipos);
  } catch (error) {
    return handleApiError(error, 'Error al obtener tipos de mantención');
  }
}

// POST /api/mantenciones/tipos - Crear tipo (admin y tecnico)
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('tiposMantencion', 'write');
    const parsed = createMaintenanceTypeSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const tipo = await crearTipoMantencion(parsed.data, session.user?.email);
    return NextResponse.json(tipo, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear tipo de mantención');
  }
}
