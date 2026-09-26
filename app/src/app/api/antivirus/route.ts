import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/lib/auth/guard";
import { opcionCatalogoSchema } from "@/lib/validations/categoria";
import { crearOpcion, listarOpciones } from "@/lib/services/catalogoOpcionesService";

// Catalogo "Antivirus" de los activos (SPEC 2.112.7). La logica es la
// misma para los tres catalogos y vive en catalogoOpcionesService.

// GET: opciones para los selectores; ?activas=true solo las activas y
// ?conUso=true cuantos activos tienen cada una (para avisar antes de eliminar).
export async function GET(request: NextRequest) {
  try {
    await requirePermission("activos", "read");
    const p = request.nextUrl.searchParams;
    return NextResponse.json(
      await listarOpciones("antivirus", { soloActivas: p.get("activas") === "true", conUso: p.get("conUso") === "true" })
    );
  } catch (error) {
    return handleApiError(error, "Error al obtener opciones");
  }
}

// POST: crea una opcion. El tecnico tambien puede, desde el formulario de
// activos ("+ Agregar opcion"); queda en la auditoria.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("activos", "write");
    const { nombre } = opcionCatalogoSchema.parse(await request.json());
    const { opcion, creada } = await crearOpcion("antivirus", nombre, session.user?.email);
    return NextResponse.json(opcion, { status: creada ? 201 : 200 });
  } catch (error) {
    return handleApiError(error, "Error al crear opción");
  }
}
