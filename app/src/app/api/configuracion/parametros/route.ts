import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from "@/shared/auth/guard";
import { guardarParametros, leerParametros } from "@/modules/configuracion/servidor";

// GET /api/configuracion/parametros - Configuracion > Seguridad (SPEC 2.112)
export async function GET() {
  try {
    await requirePermission('configuracion', 'read');
    return NextResponse.json(await leerParametros());
  } catch (error) {
    return handleApiError(error, "Error al obtener la configuración");
  }
}

// PUT /api/configuracion/parametros
export async function PUT(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    return NextResponse.json(await guardarParametros(await request.json(), session.user?.email));
  } catch (error) {
    return handleApiError(error, "Error al guardar la configuración");
  }
}
