import { NextRequest, NextResponse } from 'next/server';
import { Prisma, SystemRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { transitionSchema } from '@/lib/validations/workflow';
import { canTransition, isFinalState } from '@/lib/services/workflowStateMachine';
import {
  executeAssignment,
  executeReturn,
  executeTerminationReturn,
  type AssignmentEvidenceForDocument,
} from '@/lib/services/workflowExecutionService';
import { ConflictError, ForbiddenError, NotFoundError, requirePermission, handleApiError } from '@/lib/auth/guard';

/**
 * La firma vive en `Assignment`, que es de donde el documento inmutable la
 * toma. La transición registra qué se hizo, no una segunda copia de la
 * evidencia: `WorkflowTransition.datosAccion` guardaba la misma imagen base64
 * —hasta 256 KB por transición— y `GET /api/solicitudes/[id]` devuelve las
 * transiciones completas, así que cada carga de la ficha arrastraba todas las
 * firmas de la solicitud.
 *
 * Queda la constancia de que la firma existió; la imagen, en su único lugar.
 */
function datosAccionParaAuditoria(datosAccion: unknown) {
  if (!datosAccion || typeof datosAccion !== 'object') return undefined;
  const { firmaEmpleadoEntrega, firmaEmpleadoDevolucion, ...resto } = datosAccion as Record<string, unknown>;
  return {
    ...resto,
    ...(firmaEmpleadoEntrega ? { firmaEntregaRegistrada: true } : {}),
    ...(firmaEmpleadoDevolucion ? { firmaDevolucionRegistrada: true } : {}),
  };
}

// POST /api/solicitudes/[id]/transicion - Advance workflow state
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('solicitudes', 'read');
    const { id } = await params;
    const validationResult = transitionSchema.safeParse(await request.json());
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }
    const input = validationResult.data;

    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });

    const result = await prisma.$transaction(async (tx) => {
      const eventTimestamp = new Date();
      // Authoritative read and state claim live in the same transaction. A second
      // request observing the previous state gets a 409 before any effect runs.
      const workflowRequest = await tx.workflowRequest.findUnique({
        where: { id },
        include: { employee: true },
      });
      if (!workflowRequest) throw new NotFoundError('Solicitud no encontrada');
      if (!canTransition(workflowRequest.tipo, workflowRequest.estado, input.nuevoEstado, systemUser.rol as SystemRole)) {
        throw new ForbiddenError(
          `Transición no permitida de ${workflowRequest.estado} a ${input.nuevoEstado} para rol ${systemUser.rol}`
        );
      }
      const claimed = await tx.workflowRequest.updateMany({
        where: { id, estado: workflowRequest.estado },
        data: { updatedAt: eventTimestamp },
      });
      if (claimed.count !== 1) {
        throw new ConflictError('La solicitud cambió antes de procesarla; actualice e intente nuevamente');
      }

      const assignmentIds = [...workflowRequest.assignmentIds];
      const evidenciasParaDocumento: AssignmentEvidenceForDocument[] = [];

      switch (input.nuevoEstado) {
        case 'equipos_entregados': {
          if (workflowRequest.tipo === 'onboarding' && workflowRequest.estado === 'gestion_ti') {
            for (const assetId of input.datosAccion.assetIds) {
              const delivery = await executeAssignment(tx, {
                assetId,
                employeeId: workflowRequest.employeeId,
                fechaEntrega: eventTimestamp,
                lugarEntrega: input.datosAccion.lugarEntrega,
                entregadoPor: systemUser.nombre,
                tipoMovimiento: 'ingreso',
                motivo: `Onboarding - ${workflowRequest.numero}`,
                firmaEmpleadoEntrega: input.datosAccion.firmaEmpleadoEntrega,
                aceptaPoliticaUso: input.datosAccion.aceptaPoliticaUso,
              }, { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId });
              assignmentIds.push(delivery.assignment.id);
              evidenciasParaDocumento.push(delivery.evidenciaParaDocumento);
            }
          }
          break;
        }
        case 'cambio_ejecutado': {
          if (workflowRequest.tipo === 'cambio_equipo' && workflowRequest.estado === 'incidencia_detectada') {
            const action = input.datosAccion;
            if (action.oldAssignmentId) {
              const returned = await executeReturn(tx, {
                assignmentId: action.oldAssignmentId,
                fechaDevolucion: eventTimestamp,
                recibidoPor: systemUser.nombre,
                estadoDevolucion: action.estadoDevolucion!,
                observacionesDevolucion: `Cambio de equipo - ${workflowRequest.numero}`,
                firmaEmpleadoDevolucion: action.firmaEmpleadoDevolucion!,
                aceptaPoliticaUso: action.aceptaPoliticaUso,
              }, { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId });
              evidenciasParaDocumento.push(returned.evidenciaParaDocumento);
            }
            if (action.newAssetId) {
              const delivery = await executeAssignment(tx, {
                assetId: action.newAssetId,
                employeeId: workflowRequest.employeeId,
                fechaEntrega: eventTimestamp,
                lugarEntrega: action.lugarEntrega!,
                entregadoPor: systemUser.nombre,
                tipoMovimiento: 'cambio',
                motivo: workflowRequest.motivoCambio || `Cambio - ${workflowRequest.numero}`,
                firmaEmpleadoEntrega: action.firmaEmpleadoEntrega!,
                aceptaPoliticaUso: action.aceptaPoliticaUso,
              }, { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId });
              assignmentIds.push(delivery.assignment.id);
              evidenciasParaDocumento.push(delivery.evidenciaParaDocumento);
            }
          }
          break;
        }
        case 'equipo_recibido': {
          if (workflowRequest.tipo === 'devolucion_termino' && workflowRequest.estado === 'coordinacion_en_curso') {
            await tx.workflowRequest.update({
              where: { id },
              data: {
                medioDevolucion: input.datosAccion.medioDevolucion,
                otChilexpress: input.datosAccion.otChilexpress,
              },
            });
          }
          break;
        }
        case 'consolidacion_cierre': {
          if (workflowRequest.tipo === 'devolucion_termino' && workflowRequest.estado === 'equipo_recibido') {
            const termination = workflowRequest.terminationId
              ? await tx.termination.findUnique({ where: { id: workflowRequest.terminationId } })
              : await tx.termination.findFirst({
                  where: { employeeId: workflowRequest.employeeId },
                  orderBy: { createdAt: 'desc' },
                });
            if (!termination) throw new NotFoundError('No existe una desvinculación para el empleado de esta solicitud');
            if (termination.employeeId !== workflowRequest.employeeId) {
              throw new ConflictError('La desvinculación no pertenece al empleado de la solicitud');
            }
            const returned = await executeTerminationReturn(tx, {
              terminationId: termination.id,
              fechaDevolucionEquipos: eventTimestamp,
              estadoNotebook: input.datosAccion.estadoNotebook,
              estadoCelular: input.datosAccion.estadoCelular,
              estadoMonitor: input.datosAccion.estadoMonitor,
              estadoKit: input.datosAccion.estadoKit,
              recibidoPor: systemUser.nombre,
              lugarDevolucion: input.datosAccion.lugarDevolucion,
              observaciones: input.comentario || undefined,
              firmaEmpleadoDevolucion: input.datosAccion.firmaEmpleadoDevolucion,
              aceptaPoliticaUso: input.datosAccion.aceptaPoliticaUso,
            }, { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId });
            evidenciasParaDocumento.push(...returned.evidenciasParaDocumento);
            if (!workflowRequest.terminationId) {
              await tx.workflowRequest.update({ where: { id }, data: { terminationId: termination.id } });
            }
          }
          break;
        }
        default:
          break;
      }

      const isFinal = isFinalState(workflowRequest.tipo, input.nuevoEstado);
      const updated = await tx.workflowRequest.update({
        where: { id },
        data: {
          estado: input.nuevoEstado,
          assignmentIds,
          ...(isFinal && { fechaCierre: eventTimestamp }),
        },
        include: {
          employee: true,
          solicitante: { select: { id: true, nombre: true, rol: true } },
          responsableActual: { select: { id: true, nombre: true, rol: true } },
        },
      });
      const datosAccion = datosAccionParaAuditoria('datosAccion' in input ? input.datosAccion : undefined);
      await tx.workflowTransition.create({
        data: {
          requestId: id,
          estadoAnterior: workflowRequest.estado,
          estadoNuevo: input.nuevoEstado,
          ejecutadoPorId: systemUser.id,
          comentario: input.comentario,
          datosAccion: datosAccion as Prisma.InputJsonValue | undefined,
        },
      });
      return { workflowRequest: updated, evidenciasParaDocumento };
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al avanzar solicitud');
  }
}
