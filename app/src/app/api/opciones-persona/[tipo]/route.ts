import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { opcionPersonaSchema, tipoOpcionPersonaSchema } from '@/modules/personas';
import { crearOpcionPersona, listarOpcionesPersona } from '@/modules/personas/servidor';

// Opciones de supervisor, division, area, sub-area y listas de distribucion de
// una persona (SPEC 2.142). Las administran todos los que trabajan con solicitudes.
type Params = { params: Promise<{ tipo: string }> };

// GET: ?activas=true solo las que se ofrecen; ?conUso=true cuantas personas tiene cada una.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission('solicitudes', 'read');
    const tipo = tipoOpcionPersonaSchema.parse((await params).tipo);
    const p = request.nextUrl.searchParams;
    return NextResponse.json(
      await listarOpcionesPersona(tipo, { soloActivas: p.get('activas') === 'true', conUso: p.get('conUso') === 'true' })
    );
  } catch (error) {
    return handleApiError(error, 'Error al obtener las opciones');
  }
}

// POST: crea una opcion (o reactiva una desactivada con ese nombre).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const tipo = tipoOpcionPersonaSchema.parse((await params).tipo);
    const { nombre } = opcionPersonaSchema.parse(await request.json());
    const { opcion, creada } = await crearOpcionPersona(tipo, nombre, quienHace(session));
    return NextResponse.json(opcion, { status: creada ? 201 : 200 });
  } catch (error) {
    return handleApiError(error, 'Error al crear la opción');
  }
}
