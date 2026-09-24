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
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { auditLogService } from '@/lib/services/auditLogService';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { formatearFechaCorta } from '@/lib/utils/fechas';
import { etiquetaResultadoMantencion } from '@/lib/constants/resultadosMantencion';

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

    assertSedeAccess(session, maintenance.asset.sedeId, 'Mantención no encontrada');

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
        const actualizada = await tx.maintenance.update({
          where: { id },
          data: {
            realizadoPor: data.realizadoPor,
            resultado: data.resultado,
            resultadoTipo: data.resultadoTipo,
            costo: data.costo,
          },
          include: { tipo: true, asset: { include: { categoria: true } } },
        });
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

    // Valida la transicion a "baja" con la misma logica que
    // POST /api/mantenciones/baja, en vez de escribir el estado directo.
    if (data.resultadoTipo === "no_reparable") {
      const transitionResult = validateTransition(maintenance.asset.estado, "baja", {
        hasActiveAssignment: false,
        hasActiveMaintenance: false,
        motivo: data.motivoBaja ?? undefined,
      });
      if (!transitionResult.valid) {
        return NextResponse.json(
          { error: "Transición no permitida", details: transitionResult.errors },
          { status: 400 }
        );
      }
    }

    // Completar en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar mantención
      const updatedMaintenance = await tx.maintenance.update({
        where: { id },
        data: {
          estado: "completada",
          fechaRealizada: data.fechaRealizada,
          realizadoPor: data.realizadoPor,
          resultado: data.resultado,
          resultadoTipo: data.resultadoTipo,
          motivoBaja: data.resultadoTipo === "no_reparable" ? data.motivoBaja : null,
          costo: data.costo,
          proximaMantencion: data.proximaMantencion,
        },
        include: {
          tipo: true,
          asset: {
            include: { categoria: true },
          },
        },
      });

      // Que pasa con el activo depende del resultado estructurado
      // (resultadoTipo), no solo de si tiene dueño.
      if (data.resultadoTipo === "no_reparable") {
        // No reparable: da de baja el activo dentro de la misma transaccion.
        await tx.asset.update({
          where: { id: maintenance.assetId },
          data: { estado: "baja", fechaBaja: data.fechaRealizada },
        });

        await assetHistoryService.registrarBaja(
          maintenance.assetId,
          `Mantención ${maintenance.tipo.nombre}: ${data.motivoBaja}`,
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

      // Si hay próxima mantención programada, crear registro (aplica igual
      // sin importar el resultado, salvo no_reparable: un activo de baja no
      // vuelve a programarse).
      if (data.proximaMantencion && data.resultadoTipo !== "no_reparable") {
        await tx.maintenance.create({
          data: {
            assetId: maintenance.assetId,
            tipoId: maintenance.tipoId,
            descripcion: `Mantención programada (siguiente de #${id.slice(0, 8)})`,
            fechaProgramada: data.proximaMantencion,
            estado: "pendiente",
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
