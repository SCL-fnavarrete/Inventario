import { NextRequest, NextResponse } from 'next/server';
import { completeMaintenanceSchema } from '@/modules/mantenciones/validaciones';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { completarMantencion } from '@/modules/mantenciones/servicio';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/mantenciones/[id]/completar - Completar la mantención en proceso
// como reparada, sin reparación (baja) o en espera de repuestos (SPEC 2.96).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const { id } = await params;
    const parsed = completeMaintenanceSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const data = parsed.data;
    const result = await completarMantencion(id, data, session.user?.email || data.realizadoPor);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al completar mantención');
  }
}
