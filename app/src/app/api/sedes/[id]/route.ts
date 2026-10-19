import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { editarSedeSchema } from '@/modules/configuracion';
import { editarSede, eliminarSede } from '@/modules/configuracion/servidor';

// PATCH /api/sedes/[id] - Editar el nombre de una sede.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('sedes', 'write');
    const { id } = await params;
    const sede = await editarSede(id, editarSedeSchema.parse(await request.json()), quienHace(session));
    return NextResponse.json(sede);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar sede');
  }
}

// DELETE /api/sedes/[id] - Eliminar una sede que nada usa (SPEC 2.170): si la
// usa algo responde 409 diciendo que.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('sedes', 'delete');
    const { id } = await params;
    return NextResponse.json(await eliminarSede(id, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al eliminar sede');
  }
}
