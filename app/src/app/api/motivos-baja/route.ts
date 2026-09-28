import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/lib/auth/guard";
import { sedeWhereConFiltro } from "@/lib/auth/sedeScope";
import { opcionCatalogoSchema } from "@/lib/validations/categoria";
import { crearMotivoBaja, listarMotivosBaja } from "@/lib/services/motivoBajaService";

// Motivos de baja (SPEC 2.116.5). La logica vive en motivoBajaService.

// GET: ?activas=true solo los que se ofrecen al dar de baja; ?conUso=true
// cuantas bajas tiene cada uno, en todas las sedes y en la del navbar (?sedeId=).
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission("mantenciones", "read");
    const p = request.nextUrl.searchParams;
    return NextResponse.json(
      await listarMotivosBaja({
        soloActivos: p.get("activas") === "true",
        conUso: p.get("conUso") === "true",
        whereSede: sedeWhereConFiltro(session, p.get("sedeId")),
      })
    );
  } catch (error) {
    return handleApiError(error, "Error al obtener motivos de baja");
  }
}

// POST: crea un motivo (o reactiva uno desactivado con ese nombre). Solo admin.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("activos", "delete");
    const { nombre } = opcionCatalogoSchema.parse(await request.json());
    const { opcion, creada } = await crearMotivoBaja(nombre, session.user?.email);
    return NextResponse.json(opcion, { status: creada ? 201 : 200 });
  } catch (error) {
    return handleApiError(error, "Error al crear motivo de baja");
  }
}
