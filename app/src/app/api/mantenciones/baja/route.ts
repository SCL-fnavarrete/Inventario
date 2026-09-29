import { NextRequest, NextResponse } from 'next/server';
import { bajaPorMantencionSchema } from '@/modules/mantenciones';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { darDeBajaPorMantencion } from '@/modules/mantenciones/servidor';

// POST /api/mantenciones/baja - Dar de baja un equipo por mantencion (SPEC 2.88).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const parsed = bajaPorMantencionSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const resultado = await darDeBajaPorMantencion(parsed.data, session.user?.email || parsed.data.realizadoPor);
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al dar de baja el equipo');
  }
}
