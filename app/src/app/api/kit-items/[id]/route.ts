import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { updateKitItemSchema } from '@/modules/kit-epp';
import { editarArticuloKit, eliminarArticuloKit } from '@/modules/kit-epp/servidor';

type Params = { params: Promise<{ id: string }> };

export async function PUT(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('kitEpp', 'write');
    const { id } = await params;
    const datos = updateKitItemSchema.parse(await request.json());
    return NextResponse.json(await editarArticuloKit(id, datos, session.user?.email));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar artículo de Kit/EPP');
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const session = await requirePermission('kitEpp', 'delete');
    const { id } = await params;
    await eliminarArticuloKit(id, session.user?.email);
    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar artículo de Kit/EPP');
  }
}
