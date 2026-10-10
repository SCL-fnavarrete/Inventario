import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { opcionPersonaSchema, tipoOpcionPersonaSchema } from '@/modules/personas';
import { eliminarOpcionPersona, renombrarOpcionPersona } from '@/modules/personas/servidor';

// Una opcion de las listas de una persona (SPEC 2.142).
type Params = { params: Promise<{ tipo: string; id: string }> };

// PATCH: renombra y corrige a las personas que tenian el nombre anterior.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const { tipo, id } = await params;
    const { nombre } = opcionPersonaSchema.parse(await request.json());
    return NextResponse.json(await renombrarOpcionPersona(tipoOpcionPersonaSchema.parse(tipo), id, nombre, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar la opción');
  }
}

// DELETE: elimina una sin personas; una ya usada solo se desactiva.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('solicitudes', 'delete');
    const { tipo, id } = await params;
    return NextResponse.json(await eliminarOpcionPersona(tipoOpcionPersonaSchema.parse(tipo), id, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al eliminar la opción');
  }
}
