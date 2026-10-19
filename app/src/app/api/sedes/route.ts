import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { crearSedeSchema } from '@/modules/configuracion';
import { crearSede, listarSedes } from '@/modules/configuracion/servidor';

// GET /api/sedes - Listar sedes. Con ?conUso=true (Configuracion > Sedes)
// trae cuanto la usa cada una: solo se elimina una sin uso (SPEC 2.170).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('sedes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const sedes = await listarSedes({ conUso: searchParams.get('conUso') === 'true' });
    return NextResponse.json(sedes);
  } catch (error) {
    return handleApiError(error, "Error al obtener sedes");
  }
}

// POST /api/sedes - Crear una sede (solo admin: son datos maestros)
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('sedes', 'write');
    const sede = await crearSede(crearSedeSchema.parse(await request.json()), quienHace(session));
    return NextResponse.json(sede, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear sede');
  }
}
