import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/shared/auth/guard";
import { opcionCatalogoSchema } from "@/modules/activos/validacionesCategoria";
import { eliminarMotivoBaja, renombrarMotivoBaja } from "@/modules/mantenciones/motivosBaja";

// Un motivo de baja (SPEC 2.116.5). Lo administran admin y tecnico (recurso motivosBaja).

// PATCH: renombra; las bajas que lo usan quedan con el nombre nuevo.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("motivosBaja", "write");
    const { id } = await params;
    const { nombre } = opcionCatalogoSchema.parse(await request.json());
    return NextResponse.json(await renombrarMotivoBaja(id, nombre, session.user?.email));
  } catch (error) {
    return handleApiError(error, "Error al actualizar motivo de baja");
  }
}

// DELETE: elimina uno sin bajas; uno ya usado solo se desactiva.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("motivosBaja", "delete");
    const { id } = await params;
    return NextResponse.json(await eliminarMotivoBaja(id, session.user?.email));
  } catch (error) {
    return handleApiError(error, "Error al eliminar motivo de baja");
  }
}
