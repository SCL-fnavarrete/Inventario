import { NextRequest, NextResponse } from 'next/server';
import { bajaEquipoSchema } from '@/modules/mantenciones';
import { darDeBajaEquipo } from '@/modules/mantenciones/servidor';
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';

// POST /api/activos/[id]/baja - Dar de baja un equipo, sin mantencion (SPEC 2.140).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('activos', 'write');
    const { id } = await params;
    const parsed = bajaEquipoSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await darDeBajaEquipo(id, parsed.data, quienHace(session)), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al dar de baja el equipo');
  }
}
