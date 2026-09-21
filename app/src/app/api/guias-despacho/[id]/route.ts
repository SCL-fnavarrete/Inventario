import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoGuia } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import type { SesionAutenticada } from '@/lib/auth/guard';
import { tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { NotFoundError, ForbiddenError } from '@/lib/errors';
import { auditLogService } from '@/lib/services/auditLogService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * A una guia le importan DOS sedes (emisor y destino). Se repite aca en vez
 * de compartir con route.ts porque compara contra un registro ya cargado,
 * no arma un `where`.
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

/**
 * Confirmar recepción es una acción exclusiva de la sede destino; la sede
 * emisora tiene acceso de lectura/escritura via assertGuiaAccess pero no
 * puede confirmar por si misma.
 */
function assertPuedeConfirmarRecepcion(
  session: SesionAutenticada,
  guide: { sedeDestinoId: string }
): void {
  if (tieneVisibilidadTotal(session)) return;
  if (session.user.sedeId !== guide.sedeDestinoId) {
    throw new ForbiddenError('Solo la sede destino puede confirmar la recepción de esta guía');
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

// PATCH /api/guias-despacho/[id] - Confirmar recepción.
// Único cambio posible sobre una guía ya creada: es puramente informativo
// y no toca datos de Activos (el traslado ya se aplicó al crearla).
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
    assertPuedeConfirmarRecepcion(session, existingGuide);

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

    // Auditoria generica: quien confirmo la recepcion.
    await auditLogService.registrarActualizacion(
      'guia_despacho',
      updatedGuide.id,
      `Guía de despacho ${updatedGuide.numero}: recepción confirmada por ${recibidoPor}`,
      { estado: existingGuide.estado },
      { estado: updatedGuide.estado, recibidoPor: updatedGuide.recibidoPor },
      session.user?.email
    );

    return NextResponse.json(updatedGuide);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar guía de despacho');
  }
}
