import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, ConflictError } from '@/lib/auth/guard';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import { puedeAnularGuia } from '@/lib/queries/guias';
import { auditLogService } from '@/lib/services/auditLogService';
import { INCLUDE_DETALLE_GUIA, buscarGuiaVisible } from '@/lib/services/guiaDespachoService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/guias-despacho/[id]/anular - Anular una guía en tránsito (SPEC
// 2.108): el paquete no salió, se envió mal o se devolvió. Los equipos
// vuelven a "Disponible" en la sede de origen (nunca dejaron de ser suyos).
// Solo la sede que despacho (o admin), y solo si ningún equipo se resolvió.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id } = await params;
    const { motivo } = await request.json();

    const guia = await buscarGuiaVisible(session, id);
    if (!puedeAnularGuia(session, guia)) {
      throw new ForbiddenError('Solo la sede que despachó puede anular esta guía');
    }
    if (guia.estado !== 'en_transito' || guia.items.some((i) => i.estado !== 'en_transito')) {
      throw new ConflictError('Solo se anula una guía en tránsito que todavía no se recibe');
    }
    const detalle = typeof motivo === 'string' ? motivo.trim() : '';
    if (!detalle) {
      const mensaje = 'Escribe por qué se anula';
      throw new ValidationError(mensaje, [{ field: 'motivo', message: mensaje }]);
    }

    const usuario = session.user?.email || 'Sistema';
    const actualizada = await prisma.$transaction(async (tx) => {
      for (const item of guia.items) {
        await tx.asset.update({ where: { id: item.assetId }, data: { estado: 'disponible' } });
        await tx.assetHistory.create({
          data: {
            assetId: item.assetId,
            tipoEvento: 'traslado',
            descripcion: `Guía ${guia.numero} anulada: vuelve a Disponible en ${guia.sede?.nombre ?? 'su sede'}. Motivo: ${detalle}`,
            datosAnteriores: { estado: 'en_transito' },
            datosNuevos: { estado: 'disponible', guideId: guia.id },
            usuarioSistema: usuario,
          },
        });
      }
      await tx.dispatchGuide.update({
        where: { id },
        data: {
          estado: 'anulada',
          fechaAnulacion: new Date(),
          anuladaPor: session.user?.name || usuario,
          motivoAnulacion: detalle,
        },
      });
      await auditLogService.registrarActualizacion(
        'guia_despacho',
        id,
        `Guía de despacho ${guia.numero} anulada: ${detalle}`,
        { estado: guia.estado },
        { estado: 'anulada', motivoAnulacion: detalle },
        usuario,
        tx
      );
      return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
    });

    return NextResponse.json(actualizada);
  } catch (error) {
    return handleApiError(error, 'Error al anular la guía');
  }
}
