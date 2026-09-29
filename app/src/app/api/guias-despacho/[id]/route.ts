import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { buscarGuia, confirmarRecepcion } from '@/modules/despachos/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/guias-despacho/[id] - Detalle de un despacho
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('guias', 'read');
    const { id } = await params;
    return NextResponse.json(await buscarGuia(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener el despacho');
  }
}

// PATCH /api/guias-despacho/[id] - Confirmar la recepción (SPEC 2.108)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id } = await params;
    const guia = await confirmarRecepcion(id, await request.json(), {
      email: session.user?.email,
      nombre: session.user?.name,
    });
    return NextResponse.json(guia);
  } catch (error) {
    return handleApiError(error, 'Error al confirmar la recepción');
  }
}
