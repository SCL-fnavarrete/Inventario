import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, quienHace } from "@/shared/auth/guard";
import { filtroSede } from "@/shared/sedes/filtro";
import { opcionCatalogoSchema } from "@/modules/activos";
import { crearOpcion, listarOpciones } from "@/modules/activos/servidor";

// Catalogo "Antivirus" de los activos (SPEC 2.112.7). La logica es la
// misma para los tres catalogos y vive en catalogoOpcionesService.

// GET: opciones para los selectores; ?activas=true solo las activas y
// ?conUso=true cuantos activos tienen cada una: en todas las sedes y en la
// del navbar (?sedeId=, SPEC 2.116.3).
export async function GET(request: NextRequest) {
  try {
    await requirePermission("activos", "read");
    const p = request.nextUrl.searchParams;
    return NextResponse.json(
      await listarOpciones("antivirus", {
        soloActivas: p.get("activas") === "true",
        conUso: p.get("conUso") === "true",
        whereSede: filtroSede(p.get("sedeId")),
      })
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
    const { opcion, creada } = await crearOpcion("antivirus", nombre, quienHace(session));
    return NextResponse.json(opcion, { status: creada ? 201 : 200 });
  } catch (error) {
    return handleApiError(error, "Error al crear opción");
  }
}
