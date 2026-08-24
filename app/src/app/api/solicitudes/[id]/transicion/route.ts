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
import {
  archivarDocumento,
  documentoArchivadoDe,
  prepararEmision,
  TIMEOUT_TRANSACCION_EMISION_MS,
  type EmisionPreparada,
} from '@/lib/services/documentEmissionService';
import {
  datosDeCambio,
  datosDeDevolucion,
  datosDeEntrega,
  firmaDeEvidencias,
} from '@/lib/documents/snapshotBuilder';
import {
  contenidoCierreDesvinculacion,
  contenidoCierreOnboarding,
} from '@/lib/documents/notificationContent';
import {
  enviarNotificacion,
  prepararNotificacion,
  type NotificacionPreparada,
} from '@/lib/services/notificationService';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  requirePermission,
  handleApiError,
} from '@/lib/auth/guard';

/**
 * La evidencia del acto se emite aqui, en dos etapas (SPEC 2.1 sexies).
 *
 * Dentro de la transaccion se numera el documento, se congela su snapshot y se
 * crea la fila como `pendiente`: si el efecto de negocio se revierte, la
 * evidencia se revierte con el. La subida a SharePoint ocurre despues del
 * commit, porque Graph no participa de la transaccion; que falle no puede
 * deshacer una entrega que ya ocurrio fisicamente, asi que queda `fallido` y
 * reintentable desde `POST /api/solicitudes/[id]/documento/[tipo]`.
 *
 * El acta de devolucion se emite en `consolidacion_cierre` y no en
 * `equipo_recibido`: es esa transicion la que cierra las asignaciones y fija
 * el estado de cada equipo (SPEC 2.5.4). `equipo_recibido` solo registra el
 * medio de devolucion, y un acta emitida ahi afirmaria estados que nadie
 * declaro todavia.
 */

function solicitudDelActo(workflowRequest: { id: string; numero: string; tipo: string }) {
  return { id: workflowRequest.id, numero: workflowRequest.numero, tipo: workflowRequest.tipo };
}

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
  const { firmaEmpleadoEntrega, firmaEmpleadoDevolucion, ...resto } = datosAccion as Record<
    string,
    unknown
  >;
  return {
    ...resto,
    ...(firmaEmpleadoEntrega ? { firmaEntregaRegistrada: true } : {}),
    ...(firmaEmpleadoDevolucion ? { firmaDevolucionRegistrada: true } : {}),
  };
}

/**
 * Prepara el aviso a RRHH del cierre, dentro de la transaccion.
 *
 * Los adjuntos son documentos **ya archivados**: se buscan por su contexto y
 * los que no existan simplemente no se adjuntan. Nunca se fabrica uno desde
 * datos vivos para completar el correo.
 */
async function prepararAvisoDeCierre(
  tx: Prisma.TransactionClient,
  params: {
    workflowRequest: {
      id: string;
      numero: string;
      tipo: string;
      terminationId: string | null;
      cargoSolicitado: string | null;
      fechaDesvinculacion: Date | null;
      employee: { nombres: string; apellidoPaterno: string; rut: string | null };
    };
    emisiones: EmisionPreparada[];
    enviadaPor: string;
  }
): Promise<NotificacionPreparada | null> {
  const { workflowRequest } = params;
  const empleado =
    `${workflowRequest.employee.nombres} ${workflowRequest.employee.apellidoPaterno}`.trim();

  if (workflowRequest.tipo === 'onboarding') {
    const archivados = (
      await Promise.all(
        (['anexo_entrega', 'comprobante_entrega'] as const).map((tipo) =>
          documentoArchivadoDe({ requestId: workflowRequest.id, tipo }, tx)
        )
      )
    ).filter((documento) => documento !== null);

    const { asunto, cuerpo } = contenidoCierreOnboarding({
      numeroSolicitud: workflowRequest.numero,
      empleado,
      rut: workflowRequest.employee.rut,
      cargo: workflowRequest.cargoSolicitado,
      documentos: archivados,
    });

    return prepararNotificacion(tx, {
      tipo: 'cierre_onboarding',
      asunto,
      cuerpo,
      documentoIds: archivados.map((documento) => documento.id),
      enviadaPor: params.enviadaPor,
      contexto: { requestId: workflowRequest.id },
    });
  }

  if (workflowRequest.tipo === 'devolucion_termino') {
    // El acta se emite en esta misma transicion y todavia esta `pendiente`;
    // se adjunta por id porque para cuando el correo salga ya estara
    // archivada. Si el archivo falla, el envio falla con ella y se reintenta.
    const actas = params.emisiones.filter((emision) => emision.tipo === 'acta_devolucion');

    const { asunto, cuerpo } = contenidoCierreDesvinculacion({
      numeroSolicitud: workflowRequest.numero,
      empleado,
      rut: workflowRequest.employee.rut,
      fechaDesvinculacion: workflowRequest.fechaDesvinculacion,
      documentos: actas,
    });

    return prepararNotificacion(tx, {
      tipo: 'cierre_desvinculacion',
      asunto,
      cuerpo,
      documentoIds: actas.map((acta) => acta.documentoId),
      enviadaPor: params.enviadaPor,
      contexto: { requestId: workflowRequest.id, terminationId: workflowRequest.terminationId },
    });
  }

  // El cierre de un cambio de equipo no genera aviso a RRHH: no cambia el
  // vinculo laboral ni la liquidacion.
  return null;
}

// POST /api/solicitudes/[id]/transicion - Advance workflow state
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

    const result = await prisma.$transaction(
      async (tx) => {
        const eventTimestamp = new Date();
        // Authoritative read and state claim live in the same transaction. A second
        // request observing the previous state gets a 409 before any effect runs.
        const workflowRequest = await tx.workflowRequest.findUnique({
          where: { id },
          include: { employee: true },
        });
        if (!workflowRequest) throw new NotFoundError('Solicitud no encontrada');
        if (
          !canTransition(
            workflowRequest.tipo,
            workflowRequest.estado,
            input.nuevoEstado,
            systemUser.rol as SystemRole
          )
        ) {
          throw new ForbiddenError(
            `Transición no permitida de ${workflowRequest.estado} a ${input.nuevoEstado} para rol ${systemUser.rol}`
          );
        }
        const claimed = await tx.workflowRequest.updateMany({
          where: { id, estado: workflowRequest.estado },
          data: { updatedAt: eventTimestamp },
        });
        if (claimed.count !== 1) {
          throw new ConflictError(
            'La solicitud cambió antes de procesarla; actualice e intente nuevamente'
          );
        }

        const assignmentIds = [...workflowRequest.assignmentIds];
        const evidenciasParaDocumento: AssignmentEvidenceForDocument[] = [];
        const emisiones: EmisionPreparada[] = [];
        // La desvinculacion puede resolverse dentro del switch cuando la
        // solicitud no la traia enlazada; el aviso de cierre necesita su id.
        let terminationIdDelCierre: string | null = null;

        switch (input.nuevoEstado) {
          case 'equipos_entregados': {
            if (workflowRequest.tipo === 'onboarding' && workflowRequest.estado === 'gestion_ti') {
              for (const assetId of input.datosAccion.assetIds) {
                const delivery = await executeAssignment(
                  tx,
                  {
                    assetId,
                    employeeId: workflowRequest.employeeId,
                    fechaEntrega: eventTimestamp,
                    lugarEntrega: input.datosAccion.lugarEntrega,
                    entregadoPor: systemUser.nombre,
                    tipoMovimiento: 'ingreso',
                    motivo: `Onboarding - ${workflowRequest.numero}`,
                    firmaEmpleadoEntrega: input.datosAccion.firmaEmpleadoEntrega,
                    aceptaPoliticaUso: input.datosAccion.aceptaPoliticaUso,
                  },
                  { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId }
                );
                assignmentIds.push(delivery.assignment.id);
                evidenciasParaDocumento.push(delivery.evidenciaParaDocumento);
              }

              const entregadas = evidenciasParaDocumento.map((evidencia) => evidencia.assignmentId);
              const { anexo, comprobante } = await datosDeEntrega(tx, {
                employeeId: workflowRequest.employeeId,
                assignmentIds: entregadas,
                solicitud: solicitudDelActo(workflowRequest),
                gestionadoPor: systemUser.nombre,
                fechaEntrega: eventTimestamp,
                lugarEntrega: input.datosAccion.lugarEntrega ?? null,
                cargoSolicitado: workflowRequest.cargoSolicitado ?? null,
                firma: firmaDeEvidencias(evidenciasParaDocumento),
              });
              const contexto = {
                employeeId: workflowRequest.employeeId,
                requestId: workflowRequest.id,
              };
              for (const datos of [anexo, comprobante]) {
                emisiones.push(
                  await prepararEmision(tx, {
                    contexto,
                    emitidoPor: systemUser.nombre,
                    emitidoEn: eventTimestamp,
                    datos,
                  })
                );
              }
            }
            break;
          }
          case 'cambio_ejecutado': {
            if (
              workflowRequest.tipo === 'cambio_equipo' &&
              workflowRequest.estado === 'incidencia_detectada'
            ) {
              const action = input.datosAccion;
              if (action.oldAssignmentId) {
                const returned = await executeReturn(
                  tx,
                  {
                    assignmentId: action.oldAssignmentId,
                    fechaDevolucion: eventTimestamp,
                    recibidoPor: systemUser.nombre,
                    estadoDevolucion: action.estadoDevolucion!,
                    observacionesDevolucion: `Cambio de equipo - ${workflowRequest.numero}`,
                    firmaEmpleadoDevolucion: action.firmaEmpleadoDevolucion!,
                    aceptaPoliticaUso: action.aceptaPoliticaUso,
                  },
                  { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId }
                );
                evidenciasParaDocumento.push(returned.evidenciaParaDocumento);
              }
              if (action.newAssetId) {
                const delivery = await executeAssignment(
                  tx,
                  {
                    assetId: action.newAssetId,
                    employeeId: workflowRequest.employeeId,
                    fechaEntrega: eventTimestamp,
                    lugarEntrega: action.lugarEntrega!,
                    entregadoPor: systemUser.nombre,
                    tipoMovimiento: 'cambio',
                    motivo: workflowRequest.motivoCambio || `Cambio - ${workflowRequest.numero}`,
                    firmaEmpleadoEntrega: action.firmaEmpleadoEntrega!,
                    aceptaPoliticaUso: action.aceptaPoliticaUso,
                  },
                  { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId }
                );
                assignmentIds.push(delivery.assignment.id);
                evidenciasParaDocumento.push(delivery.evidenciaParaDocumento);
              }

              const devuelta = evidenciasParaDocumento.find(
                (evidencia) => evidencia.tipo === 'devolucion'
              );
              const entregada = evidenciasParaDocumento.find(
                (evidencia) => evidencia.tipo === 'entrega'
              );
              emisiones.push(
                await prepararEmision(tx, {
                  contexto: {
                    employeeId: workflowRequest.employeeId,
                    requestId: workflowRequest.id,
                  },
                  emitidoPor: systemUser.nombre,
                  emitidoEn: eventTimestamp,
                  datos: await datosDeCambio(tx, {
                    employeeId: workflowRequest.employeeId,
                    solicitud: solicitudDelActo(workflowRequest),
                    gestionadoPor: systemUser.nombre,
                    fecha: eventTimestamp,
                    motivoCambio: workflowRequest.motivoCambio || 'Cambio de equipo',
                    assignmentAnteriorId: devuelta?.assignmentId ?? null,
                    assignmentNuevoId: entregada?.assignmentId ?? null,
                    firma: firmaDeEvidencias(evidenciasParaDocumento),
                  }),
                })
              );
            }
            break;
          }
          case 'equipo_recibido': {
            if (
              workflowRequest.tipo === 'devolucion_termino' &&
              workflowRequest.estado === 'coordinacion_en_curso'
            ) {
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
            if (
              workflowRequest.tipo === 'devolucion_termino' &&
              workflowRequest.estado === 'equipo_recibido'
            ) {
              const termination = workflowRequest.terminationId
                ? await tx.termination.findUnique({ where: { id: workflowRequest.terminationId } })
                : await tx.termination.findFirst({
                    where: { employeeId: workflowRequest.employeeId },
                    orderBy: { createdAt: 'desc' },
                  });
              if (!termination)
                throw new NotFoundError(
                  'No existe una desvinculación para el empleado de esta solicitud'
                );
              if (termination.employeeId !== workflowRequest.employeeId) {
                throw new ConflictError(
                  'La desvinculación no pertenece al empleado de la solicitud'
                );
              }
              const returned = await executeTerminationReturn(
                tx,
                {
                  terminationId: termination.id,
                  fechaDevolucionEquipos: eventTimestamp,
                  estadoNotebook: input.datosAccion.estadoNotebook,
                  estadoCelular: input.datosAccion.estadoCelular,
                  estadoMonitor: input.datosAccion.estadoMonitor,
                  estadoOtros: input.datosAccion.estadoOtros,
                  estadoKit: input.datosAccion.estadoKit,
                  recibidoPor: systemUser.nombre,
                  lugarDevolucion: input.datosAccion.lugarDevolucion,
                  observaciones: input.comentario || undefined,
                  firmaEmpleadoDevolucion: input.datosAccion.firmaEmpleadoDevolucion,
                  aceptaPoliticaUso: input.datosAccion.aceptaPoliticaUso,
                },
                { eventTimestamp, expectedEmployeeId: workflowRequest.employeeId }
              );
              evidenciasParaDocumento.push(...returned.evidenciasParaDocumento);
              terminationIdDelCierre = termination.id;
              emisiones.push(
                await prepararEmision(tx, {
                  contexto: {
                    employeeId: workflowRequest.employeeId,
                    requestId: workflowRequest.id,
                    terminationId: termination.id,
                  },
                  emitidoPor: systemUser.nombre,
                  emitidoEn: eventTimestamp,
                  datos: await datosDeDevolucion(tx, {
                    employeeId: workflowRequest.employeeId,
                    solicitud: solicitudDelActo(workflowRequest),
                    recibidoPor: systemUser.nombre,
                    fechaDevolucion: eventTimestamp,
                    fechaTermino: workflowRequest.fechaDesvinculacion ?? null,
                    lugarDevolucion: input.datosAccion.lugarDevolucion ?? null,
                    observaciones: input.comentario ?? null,
                    assignmentIds: returned.evidenciasParaDocumento.map((e) => e.assignmentId),
                    firma: firmaDeEvidencias(returned.evidenciasParaDocumento),
                  }),
                })
              );
              if (!workflowRequest.terminationId) {
                await tx.workflowRequest.update({
                  where: { id },
                  data: { terminationId: termination.id },
                });
              }
            }
            break;
          }
          default:
            break;
        }

        const isFinal = isFinalState(workflowRequest.tipo, input.nuevoEstado);
        const notificacion = isFinal
          ? await prepararAvisoDeCierre(tx, {
              workflowRequest: {
                ...workflowRequest,
                terminationId: workflowRequest.terminationId ?? terminationIdDelCierre,
              },
              emisiones,
              enviadaPor: systemUser.nombre,
            })
          : null;

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
        const datosAccion = datosAccionParaAuditoria(
          'datosAccion' in input ? input.datosAccion : undefined
        );
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
        return { workflowRequest: updated, emisiones, notificacion };
      },
      { timeout: TIMEOUT_TRANSACCION_EMISION_MS }
    );

    /**
     * Fuera de la transaccion, y a proposito: la entrega ya esta confirmada en
     * la base. `archivarDocumento` no lanza —anota `fallido` con su error
     * saneado— para que un tenant caido no convierta un 200 en un 500.
     */
    const documentos = [];
    for (const emision of result.emisiones) {
      const archivo = await archivarDocumento(emision.documentoId);
      documentos.push({
        documentoId: emision.documentoId,
        numero: emision.numero,
        version: emision.version,
        tipo: emision.tipo,
        archivoEstado: archivo.archivoEstado,
        sharepointUrl: archivo.sharepointUrl,
        error: archivo.error,
      });
    }

    /**
     * El correo sale al final, y despues de archivar: el adjunto tiene que ser
     * el archivo inmutable. Un fallo aqui tampoco revierte el cierre; queda
     * `fallida` y reintentable desde la ficha de la desvinculacion.
     */
    const notificaciones = result.notificacion
      ? [await enviarNotificacion(result.notificacion.notificacionId)]
      : [];

    // La firma no vuelve al cliente: vive en Assignment y sellada en el
    // snapshot del documento. Devolverla en cada transicion la esparcia por
    // logs y devtools de cualquiera que pueda avanzar una solicitud.
    return NextResponse.json({
      workflowRequest: result.workflowRequest,
      documentos,
      notificaciones,
    });
  } catch (error) {
    return handleApiError(error, 'Error al avanzar solicitud');
  }
}
