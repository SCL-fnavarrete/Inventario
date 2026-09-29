import { NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { resumenSolicitudes } from '@/modules/solicitudes/servidor';

// GET /api/solicitudes/stats - Estadisticas de Solicitudes (toda la empresa)
export async function GET() {
  try {
    await requirePermission('solicitudes', 'read');
    return NextResponse.json(await resumenSolicitudes());
  } catch (error) {
    return handleApiError(error, 'Error al obtener estadísticas');
  }
}
