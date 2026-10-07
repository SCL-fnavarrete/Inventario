import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { armarHistorialAsignaciones } from '@/modules/personas';
import { asignacionesDeEmpleado } from '@/modules/personas/servidor';
import { tenenciasDePersona } from '@/modules/lineas/servidor';

// GET /api/empleados/[id]/historial - Todo lo que se le ha asignado a una persona a lo largo
// del tiempo (SPEC 2.132): equipos, Kit/EPP y lineas, del mas reciente al mas antiguo.
// Cada modulo lee lo suyo; aqui solo se juntan.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('empleados', 'read');
    await requirePermission('lineas', 'read');
    const { id } = await params;
    const [{ equipos, kit }, lineas] = await Promise.all([asignacionesDeEmpleado(id), tenenciasDePersona(id)]);
    return NextResponse.json(armarHistorialAsignaciones({ equipos, kit, lineas }));
  } catch (error) {
    return handleApiError(error, 'Error al obtener el historial de asignaciones');
  }
}
