import { NextRequest, NextResponse } from 'next/server';
import { updateAssetSchema } from '@/modules/activos';
import { detalleActivo, editarActivo, eliminarActivo } from '@/modules/activos/servidor';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('activos', 'read');
    const { id } = await params;
    return NextResponse.json(await detalleActivo(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener activo');
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('activos', 'write');
    const { id } = await params;
    const datos = updateAssetSchema.parse(await request.json());
    const asset = await editarActivo(id, datos, quienHace(session));
    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar activo');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'delete');
    const { id } = await params;
    const resultado = await eliminarActivo(
      id,
      {
        descartar: request.nextUrl.searchParams.get('descartar') === 'true',
        motivo: request.nextUrl.searchParams.get('motivo')?.trim(),
      },
      quienHace(session)
    );
    return NextResponse.json({ success: true, ...resultado });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar activo');
  }
}
