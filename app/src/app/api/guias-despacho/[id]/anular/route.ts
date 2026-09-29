import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { anularDespacho } from '@/modules/despachos/servidor';
import { devolverKitDeRepartoAnulado } from '@/modules/compras/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/guias-despacho/[id]/anular - Anular un despacho en tránsito (SPEC 2.108)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id } = await params;
    const { motivo } = await request.json();
    // Si era un reparto, Compras devuelve su Kit/EPP a lo pendiente de la compra.
    const guia = await anularDespacho(
      id,
      motivo,
      { email: session.user?.email, nombre: session.user?.name },
      devolverKitDeRepartoAnulado
    );
    return NextResponse.json(guia);
  } catch (error) {
    return handleApiError(error, 'Error al anular el despacho');
  }
}
