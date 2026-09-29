import { NextRequest, NextResponse } from 'next/server';
import { assetVentaSchema } from '@/modules/activos';
import { venderActivo } from '@/modules/activos/servidor';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';

// Venta de un equipo dado de baja.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('activos', 'write');
    const { id } = await params;
    const parsed = assetVentaSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await venderActivo(id, parsed.data, session.user?.email || 'sistema'));
  } catch (error) {
    return handleApiError(error, 'Error al registrar la venta');
  }
}
