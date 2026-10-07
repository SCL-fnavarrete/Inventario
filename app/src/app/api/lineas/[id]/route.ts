import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { lineaSchema } from '@/modules/lineas';
import { editarLinea, eliminarLinea, fichaLinea } from '@/modules/lineas/servidor';

type Params = { params: Promise<{ id: string }> };

// GET: la ficha de la linea: sus datos, quien la ha tenido, su historial y cuantas veces se reasigno.
export async function GET(_request: NextRequest, { params }: Params) {
  try {
    await requirePermission('lineas', 'read');
    const { id } = await params;
    return NextResponse.json(await fichaLinea(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener la línea');
  }
}

// PUT: edita los datos de la linea (numero, plan, precio, estado, tipo de chip, observaciones); darla
// de baja o reactivarla es cambiar su estado. Donde esta y con quien se cambia con Reasignar.
export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('lineas', 'write');
    const { id } = await params;
    const datos = lineaSchema.parse(await request.json());
    return NextResponse.json(await editarLinea(id, datos, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar línea');
  }
}

// DELETE: solo admin; queda en la auditoria.
export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('lineas', 'delete');
    const { id } = await params;
    await eliminarLinea(id, quienHace(session));
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar línea');
  }
}
