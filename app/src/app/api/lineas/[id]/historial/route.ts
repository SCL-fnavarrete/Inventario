import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { historialLinea } from '@/modules/lineas/servidor';

// GET: historial de una linea (SPEC 2.131), del mas nuevo al mas antiguo.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('lineas', 'read');
    const { id } = await params;
    return NextResponse.json(await historialLinea(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener el historial de la línea');
  }
}
