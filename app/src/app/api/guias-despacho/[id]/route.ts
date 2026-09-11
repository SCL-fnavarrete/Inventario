import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoGuia } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import type { SesionAutenticada } from '@/lib/auth/guard';
import { tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { NotFoundError } from '@/lib/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * A una guia le importan DOS sedes (emisor y destino) -- ver mismo helper
 * en route.ts. Se repite aca en vez de compartirlo porque compara contra
 * un registro ya cargado, no arma un `where`.
 */
function assertGuiaAccess(
  session: SesionAutenticada,
  guide: { sedeId: string | null; sedeDestinoId: string },
  mensaje = 'Guía de despacho no encontrada'
): void {
  if (tieneVisibilidadTotal(session)) return;
  const sedeId = session.user.sedeId;
  if (!sedeId || (guide.sedeId !== sedeId && guide.sedeDestinoId !== sedeId)) {
    throw new NotFoundError(mensaje);
  }
}

// GET /api/guias-despacho/[id] - Obtener detalle de guía
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'read');
    const { id } = await params;

    const guide = await prisma.dispatchGuide.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
        },
        sede: true,
        sedeDestino: true,
      },
    });

    if (!guide) {
      return NextResponse.json(
        { error: "Guía de despacho no encontrada" },
        { status: 404 }
      );
    }

    assertGuiaAccess(session, guide);

    return NextResponse.json(guide);
  } catch (error) {
    return handleApiError(error, 'Error al obtener guía de despacho');
  }
}

// PATCH /api/guias-despacho/[id] - Confirmar recepción
//
// Este es el único cambio posible sobre una guía ya creada: es puramente
// informativo (fecha y quién confirmó que llegó físicamente) y no toca
// datos de Activos -- el traslado de sede ya se aplicó al crear la guía.
// La guía no se puede anular ni eliminar.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id } = await params;
    const body = await request.json();
    const { recibidoPor, fechaRecepcion } = body;

    const existingGuide = await prisma.dispatchGuide.findUnique({
      where: { id },
    });

    if (!existingGuide) {
      return NextResponse.json(
        { error: "Guía de despacho no encontrada" },
        { status: 404 }
      );
    }

    assertGuiaAccess(session, existingGuide);

    if (existingGuide.estado !== EstadoGuia.despachado) {
      return NextResponse.json(
        { error: "Esta guía ya fue marcada como realizada" },
        { status: 400 }
      );
    }

    if (!recibidoPor) {
      return NextResponse.json(
        { error: "Falta indicar quién confirma la recepción" },
        { status: 400 }
      );
    }

    const updatedGuide = await prisma.dispatchGuide.update({
      where: { id },
      data: {
        estado: EstadoGuia.realizado,
        recibidoPor,
        fechaRecepcion: fechaRecepcion ? new Date(fechaRecepcion) : new Date(),
      },
      include: {
        items: {
          include: {
            asset: { include: { categoria: true } },
          },
        },
        sede: true,
        sedeDestino: true,
      },
    });

    return NextResponse.json(updatedGuide);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar guía de despacho');
  }
}
