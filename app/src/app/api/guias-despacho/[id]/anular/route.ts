import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, ConflictError } from '@/lib/auth/guard';
import { ValidationError } from '@/lib/errors';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { auditLogService } from '@/lib/services/auditLogService';
import { INCLUDE_DETALLE_GUIA, buscarGuia } from '@/lib/services/guiaDespachoService';

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

    const guia = await buscarGuia(id);
    const kitTocado = guia.kitItems.some((k) => k.cantidadRecibida > 0 || k.cantidadPerdida > 0);
    if (guia.estado !== 'en_transito' || guia.items.some((i) => i.estado !== 'en_transito') || kitTocado) {
      throw new ConflictError('Solo se anula un despacho en tránsito que todavía no se recibe');
    }
    const detalle = typeof motivo === 'string' ? motivo.trim() : '';
    if (!detalle) {
      const mensaje = 'Escribe por qué se anula';
      throw new ValidationError(mensaje, [{ field: 'motivo', message: mensaje }]);
    }

    const usuario = session.user?.email || 'Sistema';
    // Un despacho de reparto (SPEC 2.111.5) deshace el reparto: sus equipos
    // vuelven a "Por repartir" y su Kit/EPP a lo pendiente de la compra, para
    // repartirlo de nuevo. Uno del modulo deja los equipos Disponibles.
    const estadoVuelta = guia.purchaseId ? 'por_repartir' : 'disponible';
    const textoVuelta = guia.purchaseId ? 'vuelve a Por repartir' : 'vuelve a Disponible';
    const actualizada = await prisma.$transaction(async (tx) => {
      for (const item of guia.items) {
        const transicion = validateTransition('en_transito', estadoVuelta, {
          hasActiveAssignment: false,
          hasActiveMaintenance: false,
        });
        if (!transicion.valid) throw new ConflictError(transicion.errors[0]);
        await tx.asset.update({ where: { id: item.assetId }, data: { estado: estadoVuelta } });
        await tx.assetHistory.create({
          data: {
            assetId: item.assetId,
            tipoEvento: 'traslado',
            descripcion: `Despacho ${guia.numero} anulado: ${textoVuelta} en ${guia.sede?.nombre ?? 'su sede'}. Motivo: ${detalle}`,
            datosAnteriores: { estado: 'en_transito' },
            datosNuevos: { estado: estadoVuelta, guideId: guia.id },
            usuarioSistema: usuario,
          },
        });
      }
      // Kit/EPP del reparto: vuelve a lo pendiente de su linea de compra. El
      // registro del reparto queda, con el despacho anulado.
      const repartos = await tx.purchaseKitReparto.findMany({ where: { guideId: guia.id } });
      for (const r of repartos) {
        await tx.purchaseKitItem.update({
          where: { id: r.purchaseKitItemId },
          data: { cantidadPorRepartir: { increment: r.cantidad } },
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
        `Despacho ${guia.numero} anulado: ${detalle}`,
        { estado: guia.estado },
        { estado: 'anulada', motivoAnulacion: detalle },
        usuario,
        tx
      );
      return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
    });

    return NextResponse.json(actualizada);
  } catch (error) {
    return handleApiError(error, 'Error al anular el despacho');
  }
}
