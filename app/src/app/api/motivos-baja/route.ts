import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/shared/auth/guard";
import { filtroSede } from "@/shared/sedes/filtro";
import { opcionCatalogoSchema } from "@/modules/activos/validacionesCategoria";
import { crearMotivoBaja, listarMotivosBaja } from "@/modules/mantenciones/motivosBaja";

// Motivos de baja (SPEC 2.116.5). La logica vive en motivoBajaService.

// GET: ?activas=true solo los que se ofrecen al dar de baja; ?conUso=true
// cuantas bajas tiene cada uno, en todas las sedes y en la del navbar (?sedeId=).
export async function GET(request: NextRequest) {
  try {
    await requirePermission("motivosBaja", "read");
    const p = request.nextUrl.searchParams;
    return NextResponse.json(
      await listarMotivosBaja({
        soloActivos: p.get("activas") === "true",
        conUso: p.get("conUso") === "true",
        whereSede: filtroSede(p.get("sedeId")),
      })
    );
  } catch (error) {
    return handleApiError(error, "Error al obtener motivos de baja");
  }
}

// POST: crea un motivo (o reactiva uno desactivado con ese nombre).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission("motivosBaja", "write");
    const { nombre } = opcionCatalogoSchema.parse(await request.json());
    const { opcion, creada } = await crearMotivoBaja(nombre, session.user?.email);
    return NextResponse.json(opcion, { status: creada ? 201 : 200 });
  } catch (error) {
    return handleApiError(error, "Error al crear motivo de baja");
  }
}
