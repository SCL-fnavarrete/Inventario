import { NextRequest, NextResponse } from 'next/server';
import { updateMaintenanceSchema } from '@/modules/mantenciones';
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';
import {
  cancelarMantencion,
  detalleMantencion,
  editarMantencion,
  eliminarMantencion,
  iniciarMantencion,
} from '@/modules/mantenciones/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/mantenciones/[id] - Detalle de una mantención
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('mantenciones', 'read');
    const { id } = await params;
    return NextResponse.json(await detalleMantencion(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantención');
  }
}

// PUT /api/mantenciones/[id] - Iniciar, cancelar o editar una mantención
// (SPEC 2.96). Completar tiene su propia ruta: /completar.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const { id } = await params;
    const parsed = updateMaintenanceSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const data = parsed.data;
    const usuario = quienHace(session);

    const result =
      data.estado === 'en_proceso'
        ? await iniciarMantencion(id, usuario)
        : data.estado === 'cancelada'
          ? await cancelarMantencion(id, data.resultado?.trim(), usuario)
          : await editarMantencion(id, data, usuario);
    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar mantención');
  }
}

// DELETE /api/mantenciones/[id] - Eliminar una mantención pendiente.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'delete');
    const { id } = await params;
    await eliminarMantencion(id, quienHace(session));
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar mantención');
  }
}
