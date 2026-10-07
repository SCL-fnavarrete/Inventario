import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { reasignacionSchema } from '@/modules/lineas';
import { reasignarLinea } from '@/modules/lineas/servidor';

// POST: reasigna la linea (SPEC 2.131): a un telefono de la empresa, a una persona (eSIM o telefono
// personal) o sin asignar. Nunca cambia quien tiene un telefono: eso se hace en Asignaciones.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('lineas', 'write');
    const { id } = await params;
    const datos = reasignacionSchema.parse(await request.json());
    return NextResponse.json(await reasignarLinea(id, datos, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al reasignar la línea');
  }
}
