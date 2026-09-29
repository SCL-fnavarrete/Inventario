import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { requirePermission, handleApiError, ConflictError } from '@/shared/auth/guard';
import { ValidationError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import {
  INCLUDE_DETALLE_GUIA,
  actualizarEstadoGuia,
  buscarGuia,
  resolverKit,
  type AccionKit,
} from '@/modules/despachos/servidor';

interface RouteParams {
  params: Promise<{ id: string; lineaId: string }>;
}

const ACCIONES: AccionKit[] = ['llego', 'perdido', 'aparecio'];

// POST /api/guias-despacho/[id]/kit/[lineaId] - Resolver unidades de Kit/EPP
// de un despacho (SPEC 2.111.4), igual que un equipo faltante:
//   { accion: "llego", cantidad }            -> suma stock en la sede destino
//   { accion: "perdido", cantidad, motivo }  -> quedan registradas como perdidas
//   { accion: "aparecio", cantidad }         -> de perdidas a recibidas, suma stock
// Lo hace la sede destino (o admin), igual que la recepcion.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('guias', 'write');
    const { id, lineaId } = await params;
    const { accion, cantidad, motivo } = await request.json();

    if (!ACCIONES.includes(accion)) throw new ValidationError('Acción desconocida');
    const guia = await buscarGuia(id);
    if (guia.estado === 'anulada') throw new ConflictError('El despacho está anulado');
    // Antes de la recepcion, lo que llega se confirma con ella, no por linea.
    if (accion === 'llego' && guia.estado !== 'recibida_parcial') {
      throw new ConflictError('Primero confirma la recepción del despacho');
    }
    const detalle = typeof motivo === 'string' ? motivo.trim() : '';
    if (accion === 'perdido' && !detalle) {
      throw new ValidationError('Escribe qué pasó', [{ field: 'motivo', message: 'Escribe qué pasó' }]);
    }

    const usuario = session.user?.email || 'Sistema';
    const n = Number(cantidad);
    const actualizada = await prisma.$transaction(async (tx) => {
      const { nombre } = await resolverKit(tx, guia, lineaId, accion, n, usuario, detalle);
      const estado = await actualizarEstadoGuia(tx, id, guia.estado !== 'en_transito');
      const que =
        accion === 'llego' ? `llegaron ${n}` : accion === 'perdido' ? `se perdieron ${n} (${detalle})` : `aparecieron ${n}`;
      await auditLogService.registrarActualizacion(
        'guia_despacho',
        id,
        `Despacho ${guia.numero}: ${que} de ${nombre}`,
        { estado: guia.estado },
        { estado },
        usuario,
        tx
      );
      return tx.dispatchGuide.findUniqueOrThrow({ where: { id }, include: INCLUDE_DETALLE_GUIA });
    });

    return NextResponse.json(actualizada);
  } catch (error) {
    return handleApiError(error, 'Error al resolver el Kit/EPP del despacho');
  }
}
