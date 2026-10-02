import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { lineaSchema } from '@/modules/lineas';
import { editarLinea, eliminarLinea } from '@/modules/lineas/servidor';

type Params = { params: Promise<{ id: string }> };

// PUT: edita la linea; darla de baja o reactivarla es cambiar su estado.
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
