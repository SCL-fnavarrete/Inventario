import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { bajaPorMantencionSchema } from '@/lib/validations/maintenance';
import {
  requirePermission,
  handleApiError,
  respuestaDatosInvalidos,
  ConflictError,
  NotFoundError,
} from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { darDeBajaEnTransaccion } from '@/lib/services/mantencionActivoService';
import { motivoSinBaja } from '@/lib/constants/estadosActivo';
import { motivoParaBaja } from '@/lib/services/motivoBajaService';
import { mantencionACerrar } from '@/lib/utils/mantenciones';

// POST /api/mantenciones/baja - Dar de baja un equipo por mantencion (SPEC 2.88).
// Toda baja pasa por una mantencion "Sin reparación": si el equipo tiene una
// abierta se cierra esa; si no, se registra una ya cerrada. Todo en una
// transaccion, junto con el paso del activo a "baja" y su historial.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const parsed = bajaPorMantencionSchema.safeParse(await request.json());
    if (!parsed.success) {
      return respuestaDatosInvalidos(parsed.error);
    }
    const data = parsed.data;
    const usuario = session.user?.email || data.realizadoPor;

    const asset = await prisma.asset.findUnique({
      where: { id: data.assetId },
      include: {
        maintenances: {
          where: { estado: { in: ['pendiente', 'en_proceso'] } },
          include: { tipo: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!asset) throw new NotFoundError('Activo no encontrado');
    assertSedeAccess(session, asset.sedeId, 'Activo no encontrado');
    if (asset.deletedAt) {
      throw new ConflictError('Este activo esta descartado y no admite movimientos');
    }
    // Regla unica de la baja (SPEC 2.106): solo un equipo sin empleado asignado.
    const bloqueo = motivoSinBaja(asset);
    if (bloqueo) throw new ConflictError(bloqueo);

    // Motivo de la lista (SPEC 2.116.5): "Robo" o "Otro: detalle".
    const { motivoBajaId, motivoTexto } = await motivoParaBaja(prisma, { id: data.motivoBajaId }, data.motivoDetalle);

    const transicion = validateTransition(asset.estado, 'baja', {
      hasActiveAssignment: !!asset.empleadoActualId,
      hasActiveMaintenance: false,
      motivo: motivoTexto,
    });
    if (!transicion.valid) throw new ConflictError(transicion.errors[0]);

    // Tipo de la mantencion nueva, si no hay una abierta que cerrar.
    const tipo = await prisma.maintenanceType.findUnique({ where: { id: data.tipoId } });
    if (!tipo && !mantencionACerrar(asset.maintenances)) {
      throw new NotFoundError('Tipo de mantención no encontrado');
    }

    // Los pasos de la baja son compartidos con el equipo perdido en una guia
    // de despacho (darDeBajaEnTransaccion, SPEC 2.108).
    const mantencion = await prisma.$transaction((tx) =>
      darDeBajaEnTransaccion(tx, {
        asset,
        tipo: tipo ?? asset.maintenances[0].tipo,
        motivoBajaId,
        motivoTexto,
        resultado: data.observaciones?.trim() || motivoTexto,
        fechaRealizada: data.fechaRealizada,
        realizadoPor: data.realizadoPor,
        usuario,
      })
    );

    return NextResponse.json({ mantencion, assetId: asset.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al dar de baja el equipo');
  }
}
