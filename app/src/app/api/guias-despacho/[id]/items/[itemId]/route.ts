import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, ConflictError } from '@/lib/auth/guard';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { auditLogService } from '@/lib/services/auditLogService';
import { validateTransition } from '@/lib/services/assetStateMachine';
import {
  darDeBajaEnTransaccion,
  tipoCorrectivaPorDefecto,
} from '@/lib/services/mantencionActivoService';
import {
  INCLUDE_DETALLE_GUIA,
  actualizarEstadoGuia,
  buscarGuia,
  recibirEquipos,
} from '@/lib/services/guiaDespachoService';
import { motivoParaBaja } from '@/lib/services/motivoBajaService';

interface RouteParams {
  params: Promise<{ id: string; itemId: string }>;
}

// POST /api/guias-despacho/[id]/items/[itemId] - Resolver un equipo que
// sigue en tránsito (SPEC 2.108):
//   { accion: "llego" }              -> pasa a la sede destino, Disponible
//   { accion: "perdido", motivo }    -> se da de baja por Extravío
// Lo hace la sede destino (o admin), igual que la recepción.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id, itemId } = await params;
    const { accion, motivo } = await request.json();

    const guia = await buscarGuia(id);
    const item = guia.items.find((i) => i.id === itemId);
    if (!item) throw new NotFoundError('Ese equipo no es de este despacho');

    const usuario = session.user?.email || 'Sistema';
    const nombreEquipo = `${item.asset.marca} ${item.asset.modelo}`;

    // SPEC 2.111.4: un equipo que se dio por perdido en el despacho aparecio.
    // Sale de la baja y queda Disponible en la sede destino, donde aparecio.
    // Solo desde el despacho: una baja por extravio fuera de un despacho
    // sigue siendo definitiva.
    if (accion === 'aparecio') {
      if (item.estado !== 'perdido') throw new ConflictError('Ese equipo no está marcado como perdido');
      if (guia.estado === 'anulada') throw new ConflictError('El despacho está anulado');
      const transicion = validateTransition(item.asset.estado, 'disponible', {
        hasActiveAssignment: false,
        hasActiveMaintenance: false,
        aparecioEnDespacho: true,
      });
      if (!transicion.valid) {
        throw new ConflictError(
          item.asset.estado === 'vendido' ? 'El equipo ya fue vendido' : transicion.errors[0]
        );
      }
      const actualizada = await prisma.$transaction(async (tx) => {
        const { count } = await tx.asset.updateMany({
          where: { id: item.assetId, estado: 'baja' },
          data: { estado: 'disponible', sedeId: guia.sedeDestinoId, fechaBaja: null },
        });
        if (count !== 1) throw new ConflictError('El equipo cambió de estado. Vuelve a cargar la página.');
        await tx.dispatchGuideItem.update({
          where: { id: itemId },
          data: { estado: 'recibido', fechaResolucion: new Date(), resueltoPor: usuario },
        });
        await tx.assetHistory.create({
          data: {
            assetId: item.assetId,
            tipoEvento: 'cambio_estado',
            descripcion: `Apareció: se había dado por perdido en el despacho ${guia.numero}. Queda Disponible en ${guia.sedeDestino.nombre}`,
            datosAnteriores: { estado: 'baja' },
            datosNuevos: { estado: 'disponible', sedeId: guia.sedeDestinoId, guideId: guia.id },
            usuarioSistema: usuario,
          },
        });
        await auditLogService.registrarActualizacion(
          'guia_despacho',
          id,
          `Despacho ${guia.numero}: apareció ${nombreEquipo}`,
          { estado: guia.estado },
          { estado: guia.estado },
          usuario,
          tx
        );
        return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
      });
      return NextResponse.json(actualizada);
    }

    if (item.estado !== 'en_transito') {
      throw new ConflictError('Ese equipo ya se resolvió: llegó o se marcó como perdido');
    }

    if (accion === 'llego') {
      // Antes de la recepcion se confirma con ella, no uno a uno.
      if (guia.estado !== 'recibida_parcial') {
        throw new ConflictError('Primero confirma la recepción del despacho');
      }
      const actualizada = await prisma.$transaction(async (tx) => {
        await recibirEquipos(tx, guia, [itemId], usuario);
        const estado = await actualizarEstadoGuia(tx, id, true);
        await auditLogService.registrarActualizacion(
          'guia_despacho',
          id,
          `Despacho ${guia.numero}: llegó ${nombreEquipo}`,
          { estado: guia.estado },
          { estado },
          usuario,
          tx
        );
        return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
      });
      return NextResponse.json(actualizada);
    }

    if (accion === 'perdido') {
      if (guia.estado !== 'en_transito' && guia.estado !== 'recibida_parcial') {
        throw new ConflictError('Este despacho ya no tiene equipos por resolver');
      }
      const detalle = typeof motivo === 'string' ? motivo.trim() : '';
      if (!detalle) {
        const mensaje = 'Escribe qué pasó con el equipo';
        throw new ValidationError(mensaje, [{ field: 'motivo', message: mensaje }]);
      }

      // Toda baja pasa por una mantencion "Sin reparación" (SPEC 2.88), con la
      // misma logica que la baja de Mantenciones.
      // Siempre el motivo "Extravío" de la lista (SPEC 2.116.5), con lo que se escribió como detalle.
      const { motivoBajaId, motivoTexto } = await motivoParaBaja(prisma, { clave: 'extravio' }, detalle);
      const transicion = validateTransition('en_transito', 'baja', {
        hasActiveAssignment: false,
        hasActiveMaintenance: false,
        motivo: motivoTexto,
      });
      if (!transicion.valid) throw new ConflictError(transicion.errors[0]);

      const actualizada = await prisma.$transaction(async (tx) => {
        const tipo = await tipoCorrectivaPorDefecto(tx);
        if (!tipo) {
          throw new ConflictError(
            'No hay tipos de mantención activos para registrar la baja. Crea uno en Mantenciones > Tipos.'
          );
        }
        const asset = await tx.asset.findUniqueOrThrow({
          where: { id: item.assetId },
          include: {
            maintenances: {
              where: { estado: { in: ['pendiente', 'en_proceso'] } },
              include: { tipo: true },
              orderBy: { createdAt: 'asc' },
            },
          },
        });
        await darDeBajaEnTransaccion(tx, {
          asset,
          tipo,
          motivoBajaId,
          motivoTexto,
          resultado: `Perdido en el despacho (despacho ${guia.numero}): ${detalle}`,
          fechaRealizada: new Date(),
          realizadoPor: session.user?.name || usuario,
          usuario,
          descripcion: `Perdido en el despacho ${guia.numero}`,
        });
        await tx.dispatchGuideItem.update({
          where: { id: itemId },
          data: {
            estado: 'perdido',
            fechaResolucion: new Date(),
            resueltoPor: usuario,
            observaciones: detalle,
          },
        });
        const estado = await actualizarEstadoGuia(tx, id, guia.estado === 'recibida_parcial');
        await auditLogService.registrarActualizacion(
          'guia_despacho',
          id,
          `Despacho ${guia.numero}: ${nombreEquipo} se perdió (${detalle})`,
          { estado: guia.estado },
          { estado },
          usuario,
          tx
        );
        return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
      });
      return NextResponse.json(actualizada);
    }

    throw new ConflictError('Acción desconocida');
  } catch (error) {
    return handleApiError(error, 'Error al resolver el equipo del despacho');
  }
}
