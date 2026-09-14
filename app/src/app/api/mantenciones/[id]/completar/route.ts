import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeMaintenanceSchema } from "@/lib/validations/maintenance";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { auditLogService } from '@/lib/services/auditLogService';
import { validateTransition } from '@/lib/services/assetStateMachine';

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

    // Verificar que no está ya completada o cancelada
    if (maintenance.estado === "completada") {
      return NextResponse.json(
        { error: "La mantención ya está completada" },
        { status: 400 }
      );
    }

    if (maintenance.estado === "cancelada") {
      return NextResponse.json(
        { error: "No se puede completar una mantención cancelada" },
        { status: 400 }
      );
    }

    const usuario = session.user?.email || data.realizadoPor;

    // La maquina de estados ya documentaba esta transicion
    // ("en_mantencion→baja", motivo obligatorio) pero esta ruta nunca la
    // invocaba -- se agrega la misma validacion que usa
    // POST /api/activos/[id]/baja, en vez de escribir el estado directo.
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

      // SPEC 2.25: que pasa con el activo depende del resultado
      // estructurado, no solo de si tenia dueño -- antes SIEMPRE volvia a
      // disponible/asignado/reutilizable, incluso si el texto libre decia
      // "no reparable".
      if (data.resultadoTipo === "no_reparable") {
        // No reparable: el activo se da de baja, igual que
        // POST /api/activos/[id]/baja (SPEC 2.7.3), pero como parte de esta
        // misma transaccion en vez de exigir un segundo paso manual.
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
      } else {
        // Reparado: vuelve a servicio. Pendiente de repuestos: se completa
        // este intento de mantencion, pero el activo se queda en
        // "en_mantencion" -- no vuelve a servicio hasta una proxima
        // mantencion que si lo repare.
        let nuevoEstado: "disponible" | "asignado" | "reutilizable" | "en_mantencion" = "disponible";

        if (data.resultadoTipo === "pendiente_repuestos") {
          nuevoEstado = "en_mantencion";
        } else if (maintenance.asset.empleadoActualId) {
          nuevoEstado = "asignado";
        } else if (maintenance.asset.condicion === "usado") {
          nuevoEstado = "reutilizable";
        }

        await tx.asset.update({
          where: { id: maintenance.assetId },
          data: { estado: nuevoEstado },
        });

        // Registrar en historial
        await tx.assetHistory.create({
          data: {
            assetId: maintenance.assetId,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${maintenance.tipo.nombre} completada. Resultado: ${data.resultado}`,
            datosAnteriores: { estado: "en_mantencion" },
            datosNuevos: {
              estado: nuevoEstado,
              maintenanceId: id,
              resultado: data.resultado,
              resultadoTipo: data.resultadoTipo,
              costo: data.costo,
            },
            usuarioSistema: data.realizadoPor,
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

      // Auditoria generica (SPEC 2.31): quien completo el ticket y con que
      // resultado.
      await auditLogService.registrarActualizacion(
        'mantencion',
        id,
        `Mantención completada: ${updatedMaintenance.tipo.nombre} (resultado: ${data.resultadoTipo})`,
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
