import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { CATALOGOS_LINEA, opcionLineaSchema } from '@/modules/lineas';
import { editarOpcionLinea, eliminarOpcionLinea } from '@/modules/lineas/servidor';

// Una opcion de un catalogo de las lineas (SPEC 2.131).
type Params = { params: Promise<{ catalogo: string; id: string }> };
const catalogoSchema = z.enum(CATALOGOS_LINEA);

// PATCH: renombra y cambia el precio del plan o si el estado cuenta como baja.
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('catalogosLineas', 'write');
    const { catalogo, id } = await params;
    const datos = opcionLineaSchema.parse(await request.json());
    return NextResponse.json(await editarOpcionLinea(catalogoSchema.parse(catalogo), id, datos, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar la opción');
  }
}

// DELETE: elimina una sin lineas; una ya usada solo se desactiva.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('catalogosLineas', 'delete');
    const { catalogo, id } = await params;
    return NextResponse.json(await eliminarOpcionLinea(catalogoSchema.parse(catalogo), id, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al eliminar la opción');
  }
}
