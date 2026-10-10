import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { CATALOGOS_LINEA, opcionLineaSchema } from '@/modules/lineas';
import { crearOpcionLinea, listarOpcionesLinea } from '@/modules/lineas/servidor';

// Catalogos de las lineas: estados, tipos de chip, operadores y motivos (SPEC 2.131).
type Params = { params: Promise<{ catalogo: string }> };
const catalogoSchema = z.enum(CATALOGOS_LINEA);

// GET: ?activas=true solo las que se ofrecen; ?conUso=true cuantas lineas tiene cada una.
export async function GET(request: NextRequest, { params }: Params) {
  try {
    await requirePermission('catalogosLineas', 'read');
    const catalogo = catalogoSchema.parse((await params).catalogo);
    const p = request.nextUrl.searchParams;
    return NextResponse.json(
      await listarOpcionesLinea(catalogo, { soloActivas: p.get('activas') === 'true', conUso: p.get('conUso') === 'true' })
    );
  } catch (error) {
    return handleApiError(error, 'Error al obtener el catálogo');
  }
}

// POST: crea una opcion (o reactiva una desactivada con ese nombre).
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('catalogosLineas', 'write');
    const catalogo = catalogoSchema.parse((await params).catalogo);
    const datos = opcionLineaSchema.parse(await request.json());
    const { opcion, creada } = await crearOpcionLinea(catalogo, datos, quienHace(session));
    return NextResponse.json(opcion, { status: creada ? 201 : 200 });
  } catch (error) {
    return handleApiError(error, 'Error al crear la opción');
  }
}
