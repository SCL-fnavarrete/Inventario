import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { lineasDePersona } from '@/modules/lineas/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/empleados/[id]/lineas - Lineas vigentes de la persona (las de su celular y las suyas)
export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('lineas', 'read');
    const { id } = await params;
    return NextResponse.json(await lineasDePersona(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener las líneas');
  }
}
