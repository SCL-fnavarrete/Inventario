import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from "@/lib/auth/guard";

// Editar el nombre de una opcion del catalogo "Licencia Microsoft 365". Solo admin. El
// campo del activo sigue siendo texto plano (no una relacion), asi que al
// renombrar se propaga el cambio a los activos que ya tenian el nombre
// anterior guardado -- si no, quedarian con un valor huerfano que ya no
// aparece en ningun selector.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("activos", "delete");
    const { id } = await params;
    const body = await request.json();

    const nombreNuevo = typeof body.nombre === "string" ? body.nombre.trim() : undefined;
    if (!nombreNuevo) {
      return NextResponse.json({ error: "El nombre es requerido" }, { status: 400 });
    }

    const actual = await prisma.licenciaMicrosoft365.findUnique({ where: { id } });
    if (!actual) {
      return NextResponse.json({ error: "Opcion no encontrada" }, { status: 404 });
    }

    const [actualizada] = await prisma.$transaction([
      prisma.licenciaMicrosoft365.update({ where: { id }, data: { nombre: nombreNuevo } }),
      prisma.asset.updateMany({
        where: { tipoLicenciaMicrosoft365: actual.nombre },
        data: { tipoLicenciaMicrosoft365: nombreNuevo },
      }),
    ]);

    return NextResponse.json(actualizada);
  } catch (error) {
    return handleApiError(error, "Error al actualizar opcion");
  }
}

// Eliminar una opcion del catalogo. No toca los activos que ya la tienen
// guardada como texto (siguen mostrando ese valor en su ficha); solo deja
// de estar disponible para elegirla en nuevos activos.
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission("activos", "delete");
    const { id } = await params;

    await prisma.licenciaMicrosoft365.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error, "Error al eliminar opcion");
  }
}
