import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { editarSedeSchema } from '@/modules/configuracion';
import { editarSede } from '@/modules/configuracion/servidor';

// PATCH /api/sedes/[id] - Editar el nombre o activar/desactivar una sede.
// Desactivarla deja fuera a sus tecnicos (SPEC 2.112.6).
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
