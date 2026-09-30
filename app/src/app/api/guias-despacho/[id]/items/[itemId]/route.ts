import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { resolverEquipoDespacho } from '@/modules/despachos/servidor';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

// POST /api/guias-despacho/[id]/items/[itemId] - Resolver un equipo que sigue
// en tránsito: { accion: "llego" | "perdido" (con motivo) | "aparecio" }
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id, itemId } = await params;
    const { accion, motivo } = await request.json();
    const guia = await resolverEquipoDespacho(id, itemId, accion, motivo, {
      usuario: quienHace(session),
      nombre: session.user?.name,
    });
    return NextResponse.json(guia);
  } catch (error) {
    return handleApiError(error, 'Error al resolver el equipo del despacho');
  }
}
