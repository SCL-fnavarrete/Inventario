import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { resolverKitDespacho } from '@/modules/despachos/servidor';

interface RouteParams {
  params: Promise<{ id: string; lineaId: string }>;
}

// POST /api/guias-despacho/[id]/kit/[lineaId] - Resolver unidades de Kit/EPP
// de un despacho (SPEC 2.111.4): { accion: "llego" | "perdido" | "aparecio", cantidad, motivo? }
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id, lineaId } = await params;
    const guia = await resolverKitDespacho(id, lineaId, await request.json(), {
      email: session.user?.email,
      nombre: session.user?.name,
    });
    return NextResponse.json(guia);
  } catch (error) {
    return handleApiError(error, 'Error al resolver el Kit/EPP del despacho');
  }
}
