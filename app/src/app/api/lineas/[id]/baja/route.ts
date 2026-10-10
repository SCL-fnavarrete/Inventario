import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { bajaLineaSchema } from '@/modules/lineas';
import { darDeBajaLinea } from '@/modules/lineas/servidor';

// POST: da de baja la linea con su motivo (SPEC 2.140).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('lineas', 'write');
    const { id } = await params;
    const datos = bajaLineaSchema.parse(await request.json());
    return NextResponse.json(await darDeBajaLinea(id, datos, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al dar de baja la línea');
  }
}
