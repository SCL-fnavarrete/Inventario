import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { updateMaintenanceTypeSchema } from '@/modules/mantenciones';
import { editarTipoMantencion, eliminarTipoMantencion } from '@/modules/mantenciones/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT /api/mantenciones/tipos/[id] - Actualizar (o desactivar) un tipo
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('tiposMantencion', 'write');
    const { id } = await params;
    const parsed = updateMaintenanceTypeSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await editarTipoMantencion(id, parsed.data, session.user?.email));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar tipo de mantención');
  }
}

// DELETE /api/mantenciones/tipos/[id] - Eliminar un tipo que nadie usa
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('tiposMantencion', 'delete');
    const { id } = await params;
    await eliminarTipoMantencion(id, session.user?.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar tipo de mantención');
  }
}
