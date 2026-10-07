import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, quienHace } from "@/shared/auth/guard";
import { opcionCatalogoSchema } from "@/modules/activos";
import { eliminarOpcion, renombrarOpcion } from "@/modules/activos/servidor";

// Opcion del catalogo "Licencia Microsoft 365" (SPEC 2.112.7). Renombrar y eliminar
// son solo de admin; la logica vive en catalogoOpcionesService.

// PATCH: renombra y corrige los activos que tenian el nombre anterior.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("activos", "delete");
    const { id } = await params;
    const { nombre } = opcionCatalogoSchema.parse(await request.json());
    return NextResponse.json(await renombrarOpcion("licencias-m365", id, nombre, quienHace(session)));
  } catch (error) {
    return handleApiError(error, "Error al actualizar opción");
  }
}

// DELETE: deja de ofrecerse; los activos que la tienen no se tocan.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission("activos", "delete");
    const { id } = await params;
    // Si un activo la usa, queda desactivada en vez de borrarse (SPEC 2.136).
    return NextResponse.json(await eliminarOpcion("licencias-m365", id, quienHace(session)));
  } catch (error) {
    return handleApiError(error, "Error al eliminar opción");
  }
}
