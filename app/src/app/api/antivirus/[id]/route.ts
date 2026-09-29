import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/shared/auth/guard";
import { opcionCatalogoSchema } from "@/modules/activos/validacionesCategoria";
import { eliminarOpcion, renombrarOpcion } from "@/modules/activos/catalogos";

// Opcion del catalogo "Antivirus" (SPEC 2.112.7). Renombrar y eliminar
// son solo de admin; la logica vive en catalogoOpcionesService.

// PATCH: renombra y corrige los activos que tenian el nombre anterior.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("activos", "delete");
    const { id } = await params;
    const { nombre } = opcionCatalogoSchema.parse(await request.json());
    return NextResponse.json(await renombrarOpcion("antivirus", id, nombre, session.user?.email));
  } catch (error) {
    return handleApiError(error, "Error al actualizar opción");
  }
}

// DELETE: deja de ofrecerse; los activos que la tienen no se tocan.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("activos", "delete");
    const { id } = await params;
    await eliminarOpcion("antivirus", id, session.user?.email);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Error al eliminar opción");
  }
}
