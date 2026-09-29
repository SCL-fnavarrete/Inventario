import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeMaintenanceSchema } from "@/lib/validations/maintenance";
import {
  requirePermission,
  handleApiError,
  respuestaDatosInvalidos,
  ConflictError,
} from '@/lib/auth/guard';
import {
  cancelarAbiertasPorBaja,
  registrarSalidaDeMantencion,
} from '@/lib/services/mantencionActivoService';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { auditLogService } from '@/lib/services/auditLogService';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { formatearFechaCorta } from '@/lib/utils/fechas';
import { etiquetaResultadoMantencion } from '@/lib/constants/resultadosMantencion';
import { motivoSinBaja } from '@/lib/constants/estadosActivo';
import { siSigueIgual } from '@/lib/utils/concurrencia';
import { motivoParaBaja } from '@/lib/services/motivoBajaService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/mantenciones/[id]/completar - Completar mantención
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = completeMaintenanceSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Verificar que existe la mantención
    const maintenance = await prisma.maintenance.findUnique({
      where: { id },
      include: {
        tipo: true,
        asset: true,
      },
    });

    if (!maintenance) {
      return NextResponse.json(
        { error: "Mantención no encontrada" },
        { status: 404 }
      );
    }

    // Solo se completa la mantencion en proceso (SPEC 2.96): una pendiente
    // primero se inicia, que es cuando el equipo entra a mantencion.
    if (maintenance.estado === "completada") {
      throw new ConflictError("La mantención ya está completada");
    }
    if (maintenance.estado === "cancelada") {
      throw new ConflictError("No se puede completar una mantención cancelada");
    }
    if (maintenance.estado !== "en_proceso") {
      throw new ConflictError(
        "Primero inicia la mantención: el equipo entra a mantención al iniciarla"
      );
    }

    const usuario = session.user?.email || data.realizadoPor;

    // Faltan repuestos: la mantencion sigue abierta, en proceso, con la nota;
    // el equipo sigue en mantencion hasta completarla como Reparado o No
    // reparable.
    if (data.resultadoTipo === "pendiente_repuestos") {
      const enEspera = await prisma.$transaction(async (tx) => {
        const actualizada = await siSigueIgual(
          tx.maintenance.update({
            where: { id, estado: "en_proceso" },
            data: {
              realizadoPor: data.realizadoPor,
              resultado: data.resultado,
              resultadoTipo: data.resultadoTipo,
              costo: data.costo,
            },
            include: { tipo: true, asset: { include: { categoria: true } } },
          })
        );
        await tx.assetHistory.create({
          data: {
            assetId: maintenance.assetId,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${maintenance.tipo.nombre} en espera de repuestos: ${data.resultado}`,
            datosNuevos: { maintenanceId: id, resultadoTipo: data.resultadoTipo },
            usuarioSistema: usuario,
          },
        });
        await auditLogService.registrarActualizacion(
          'mantencion',
          id,
          `Mantención en espera de repuestos: ${maintenance.tipo.nombre}`,
          { resultadoTipo: maintenance.resultadoTipo, resultado: maintenance.resultado },
          { resultadoTipo: data.resultadoTipo, resultado: data.resultado },
          usuario,
          tx
        );
        return actualizada;
      });
      return NextResponse.json(enEspera);
    }

    // "Sin reparación" da de baja: misma regla y misma transicion que
    // POST /api/mantenciones/baja (SPEC 2.106), en vez de escribir el estado
    // directo. Antes esta ruta no revisaba si el equipo seguia asignado.
    let baja: { motivoBajaId: string | null; motivoTexto: string | null } = { motivoBajaId: null, motivoTexto: null };
    if (data.resultadoTipo === "no_reparable") {
      const bloqueo = motivoSinBaja(maintenance.asset);
      if (bloqueo) throw new ConflictError(bloqueo);
      // Motivo de la lista (SPEC 2.116.5): "Robo" o "Otro: detalle".
      baja = await motivoParaBaja(prisma, { id: data.motivoBajaId! }, data.motivoDetalle);
      const transitionResult = validateTransition(maintenance.asset.estado, "baja", {
        hasActiveAssignment: !!maintenance.asset.empleadoActualId,
        hasActiveMaintenance: false,
        motivo: baja.motivoTexto ?? undefined,
      });
      if (!transitionResult.valid) throw new ConflictError(transitionResult.errors[0]);
    }

    // Completar en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Solo si sigue en proceso: un doble envio desde dos pestañas ya no
      // la completa dos veces (auditoria 28-sep-2026, 7.A-1).
      const updatedMaintenance = await siSigueIgual(tx.maintenance.update({
        where: { id, estado: "en_proceso" },
        data: {
          estado: "completada",
          fechaRealizada: data.fechaRealizada,
          realizadoPor: data.realizadoPor,
          resultado: data.resultado,
          resultadoTipo: data.resultadoTipo,
          motivoBajaId: baja.motivoBajaId,
          motivoBaja: baja.motivoTexto,
          costo: data.costo,
          proximaMantencion: data.proximaMantencion,
        },
        include: {
          tipo: true,
          asset: {
            include: { categoria: true },
          },
        },
      }));

      // Que pasa con el activo depende del resultado estructurado
      // (resultadoTipo), no solo de si tiene dueño.
      if (data.resultadoTipo === "no_reparable") {
        // No reparable: da de baja el activo dentro de la misma transaccion.
        await siSigueIgual(
          tx.asset.update({
            where: { id: maintenance.assetId, estado: maintenance.asset.estado, empleadoActualId: null },
            data: { estado: "baja", fechaBaja: data.fechaRealizada },
          })
        );

        await assetHistoryService.registrarBaja(
          maintenance.assetId,
          `Mantención ${maintenance.tipo.nombre}: ${baja.motivoTexto}`,
          maintenance.asset.condicion,
          usuario,
          tx
        );

        // Un equipo de baja no queda con mantenciones programadas.
        await cancelarAbiertasPorBaja(tx, maintenance.assetId, id);
      } else {
        // Reparado: vuelve a servicio (asignado si tiene dueño, si no
        // disponible, independiente de su condicion).
        await registrarSalidaDeMantencion(tx, {
          asset: maintenance.asset,
          maintenanceId: id,
          descripcion: `Mantención ${maintenance.tipo.nombre} realizada el ${formatearFechaCorta(data.fechaRealizada)}: ${etiquetaResultadoMantencion(data.resultadoTipo)}. ${data.resultado}`,
          usuario,
          devolverEquipo: true,
          extra: {
            resultado: data.resultado,
            resultadoTipo: data.resultadoTipo,
            costo: data.costo ?? null,
          },
        });
      }

      // Proxima mantencion: queda programada, pendiente, con el mismo tipo
      // (salvo Sin reparacion: un equipo de baja no vuelve a programarse).
      if (data.proximaMantencion && data.resultadoTipo !== "no_reparable") {
        const descripcion = `Siguiente a la mantención ${maintenance.tipo.nombre} del ${formatearFechaCorta(data.fechaRealizada)}`;
        const siguiente = await tx.maintenance.create({
          data: {
            assetId: maintenance.assetId,
            tipoId: maintenance.tipoId,
            descripcion,
            fechaProgramada: data.proximaMantencion,
            estado: "pendiente",
          },
        });
        await tx.assetHistory.create({
          data: {
            assetId: maintenance.assetId,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${maintenance.tipo.nombre} programada para el ${formatearFechaCorta(data.proximaMantencion)}: ${descripcion}`,
            datosNuevos: { maintenanceId: siguiente.id },
            usuarioSistema: usuario,
          },
        });
      }

      // Registra quien completo el ticket y con que resultado.
      await auditLogService.registrarActualizacion(
        'mantencion',
        id,
        `Mantención completada: ${updatedMaintenance.tipo.nombre} (${etiquetaResultadoMantencion(data.resultadoTipo)})`,
        { estado: maintenance.estado },
        { estado: 'completada', resultadoTipo: data.resultadoTipo, resultado: data.resultado },
        usuario,
        tx
      );

      return updatedMaintenance;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al completar mantención');
  }
}
