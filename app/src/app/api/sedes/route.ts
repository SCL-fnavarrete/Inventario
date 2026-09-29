import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { crearSedeSchema } from '@/modules/configuracion';
import { crearSede, listarSedes } from '@/modules/configuracion/servidor';

// GET /api/sedes - Listar sedes. Con ?conUso=true (Configuracion > Sedes)
// trae cuantos tecnicos activos y equipos tiene cada una (SPEC 2.112.6).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('sedes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const sedes = await listarSedes({
      soloActivas: searchParams.get('activas') === 'true',
      conUso: searchParams.get('conUso') === 'true',
    });
    return NextResponse.json(sedes);
  } catch (error) {
    return handleApiError(error, "Error al obtener sedes");
  }
}

// POST /api/sedes - Crear una sede (solo admin: son datos maestros)
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('sedes', 'write');
    const sede = await crearSede(crearSedeSchema.parse(await request.json()), session.user?.email);
    return NextResponse.json(sede, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear sede');
  }
}
