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
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { auditLogService } from '@/lib/services/auditLogService';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { etiquetaMotivoBaja, motivoSinBaja } from '@/lib/constants/estadosActivo';

// POST /api/mantenciones/baja - Dar de baja un equipo por mantencion (SPEC 2.88).
// Toda baja pasa por una mantencion "No reparable": si el equipo tiene una
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
    const bloqueo = motivoSinBaja(asset.estado);
    if (bloqueo) throw new ConflictError(bloqueo);

    const motivoTexto =
      data.motivo === 'otro'
        ? `${etiquetaMotivoBaja(data.motivo)}: ${data.motivoDetalle?.trim()}`
        : etiquetaMotivoBaja(data.motivo);

    const transicion = validateTransition(asset.estado, 'baja', {
      hasActiveAssignment: false,
      hasActiveMaintenance: false,
      motivo: motivoTexto,
    });
    if (!transicion.valid) {
      return NextResponse.json(
        { error: 'Transición no permitida', details: transicion.errors },
        { status: 400 }
      );
    }

    // La mantencion abierta mas antigua es la que se cierra; su tipo manda.
    const [abierta, ...otrasAbiertas] = asset.maintenances;
    const tipo = abierta
      ? abierta.tipo
      : await prisma.maintenanceType.findUnique({ where: { id: data.tipoId } });
    if (!tipo) throw new NotFoundError('Tipo de mantención no encontrado');

    const cierre = {
      estado: 'completada' as const,
      fechaRealizada: data.fechaRealizada,
      realizadoPor: data.realizadoPor,
      resultado: data.observaciones?.trim() || motivoTexto,
      resultadoTipo: 'no_reparable',
      motivoBaja: motivoTexto,
    };

    const mantencion = await prisma.$transaction(async (tx) => {
      const m = abierta
        ? await tx.maintenance.update({ where: { id: abierta.id }, data: cierre })
        : await tx.maintenance.create({
            data: {
              assetId: asset.id,
              tipoId: tipo.id,
              descripcion: `Dar de baja: ${motivoTexto}`,
              fechaProgramada: data.fechaRealizada,
              ...cierre,
            },
          });

      // Un equipo de baja no queda con otras mantenciones pendientes.
      if (otrasAbiertas.length > 0) {
        await tx.maintenance.updateMany({
          where: { id: { in: otrasAbiertas.map((o) => o.id) } },
          data: { estado: 'cancelada', resultado: 'Cancelada: el equipo se dio de baja' },
        });
      }

      await tx.asset.update({
        where: { id: asset.id },
        data: { estado: 'baja', fechaBaja: data.fechaRealizada },
      });

      await assetHistoryService.registrarBaja(
        asset.id,
        `Mantención ${tipo.nombre}: ${motivoTexto}`,
        asset.condicion,
        usuario,
        tx
      );

      if (abierta) {
        await auditLogService.registrarActualizacion(
          'mantencion',
          m.id,
          `Mantención ${tipo.nombre} cerrada como No reparable: ${asset.marca} ${asset.modelo} dado de baja`,
          { estado: abierta.estado },
          { estado: 'completada', resultadoTipo: 'no_reparable', motivoBaja: motivoTexto },
          usuario,
          tx
        );
      } else {
        await auditLogService.registrarCreacion(
          'mantencion',
          m.id,
          `Mantención de baja: ${tipo.nombre} para ${asset.marca} ${asset.modelo}`,
          { assetId: asset.id, tipoId: tipo.id, resultadoTipo: 'no_reparable', motivoBaja: motivoTexto },
          usuario,
          tx
        );
      }

      return m;
    });

    return NextResponse.json({ mantencion, assetId: asset.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al dar de baja el equipo');
  }
}
