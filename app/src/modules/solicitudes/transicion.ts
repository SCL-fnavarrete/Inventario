import { prisma } from '@/shared/prisma';
import type { TransitionInput } from '@/modules/solicitudes/validaciones';
import { canTransition, isFinalState } from '@/modules/solicitudes/maquinaEstados';
import {
  executeAssignment,
  executeReturn,
  executeKitReturn,
} from '@/modules/solicitudes/ejecucion';
import { SystemRole, EstadoSolicitud } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '@/shared/errores';
import {
  condicionCargadorSchema,
  type CondicionCargador,
} from '@/modules/activos';

// datosAccion llega sin schema propio: la condicion del cargador se valida
// aca para responder 400 (y no un error de Prisma) ante un valor invalido,
// por ejemplo uno de los nombres antiguos (ok/danado/no_aplica).
function leerCondicionCargador(valor: unknown): CondicionCargador | undefined {
  if (valor === undefined || valor === null || valor === '') return undefined;
  const resultado = condicionCargadorSchema.safeParse(valor);
  if (!resultado.success) throw new ValidationError('Condición del cargador inválida');
  return resultado.data;
}

/**
 * Avanza una solicitud de un estado a otro (SPEC 2.82): valida que la
 * transicion la pueda hacer el rol (canTransition), revisa lo que falta antes
 * de cerrar y ejecuta sus acciones (entregas, cambios, devoluciones) en una
 * transaccion. Una segunda transicion sobre la misma solicitud responde 409.
 */
export async function aplicarTransicion(
  id: string,
  { nuevoEstado, comentario, datosAccion }: TransitionInput,
  systemUser: { id: string; nombre: string; rol: SystemRole }
) {
  // Find the request
  const workflowRequest = await prisma.workflowRequest.findUnique({
    where: { id },
    include: { employee: true },
  });
  if (!workflowRequest) {
    throw new NotFoundError('Solicitud no encontrada');
  }

  // La entrega parcial de equipos en onboarding no es una transicion de estado
  // real: la solicitud se queda en gestion_ti hasta cubrir todas las categorias
  // requeridas, entregando de a poco lo que si hay stock. Por eso no pasa por
  // canTransition (no existe una regla gestion_ti -> gestion_ti) y en su lugar
  // solo se valida que el rol pueda gestionar TI.
  const esEntregaParcialOnboarding =
    workflowRequest.tipo === 'onboarding' &&
    workflowRequest.estado === 'gestion_ti' &&
    nuevoEstado === 'gestion_ti';

  if (esEntregaParcialOnboarding) {
    if (!['tecnico', 'admin'].includes(systemUser.rol)) {
      throw new ForbiddenError(`No tiene permisos para gestionar equipos como ${systemUser.rol}`);
    }
  } else if (
    !canTransition(
      workflowRequest.tipo,
      workflowRequest.estado,
      nuevoEstado,
      systemUser.rol as SystemRole
    )
  ) {
    throw new ForbiddenError(
      `Transición no permitida de ${workflowRequest.estado} a ${nuevoEstado} para rol ${systemUser.rol}`
    );
  }

  // No se puede cerrar un onboarding si se pidio Kit de Bienvenida y/o EPP
  // pero no se entrego nada de eso. Si hay detalle articulo-por-articulo
  // (RequestKitItem) se valida cada uno (pendiente bloquea, no_aplica no);
  // si no, se usa el chequeo por categoria (booleano + entrega).
  if (
    workflowRequest.tipo === 'onboarding' &&
    workflowRequest.estado === 'equipos_entregados' &&
    nuevoEstado === 'registro_rrhh'
  ) {
    const requeridos = await prisma.requestKitItem.findMany({
      where: { requestId: id },
      include: { item: true },
    });
    const entregas = await prisma.kitAssignment.findMany({
      where: { requestId: id },
      include: { item: true },
    });

    // Por categoria: usa las filas granulares (RequestKitItem) si existen;
    // si no, cae al chequeo por booleano+entrega para esa categoria sola.
    const nombresPendientes: string[] = [];
    const categoriasFaltantesLegacy: string[] = [];

    for (const [categoria, solicitado, etiqueta] of [
      ['kit_bienvenida', workflowRequest.kitBienvenidaSolicitado, 'el Kit de Bienvenida'],
      ['epp', workflowRequest.eppSolicitado, 'el EPP'],
    ] as const) {
      const filasCategoria = requeridos.filter((r) => r.item.categoria === categoria);
      if (filasCategoria.length > 0) {
        nombresPendientes.push(
          ...filasCategoria.filter((r) => r.estado === 'pendiente').map((r) => r.item.nombre)
        );
      } else if (solicitado && !entregas.some((e) => e.item.categoria === categoria)) {
        categoriasFaltantesLegacy.push(etiqueta);
      }
    }

    if (nombresPendientes.length > 0 || categoriasFaltantesLegacy.length > 0) {
      const partes = [
        ...(nombresPendientes.length > 0
          ? [`${nombresPendientes.join(', ')} (o márcalos como "No aplica")`]
          : []),
        ...categoriasFaltantesLegacy,
      ];
      throw new ValidationError(`Falta entregar ${partes.join(' y ')} antes de cerrar el ticket`);
    }
  }

  // Tampoco se puede cerrar un offboarding si todavia queda equipo activo
  // o EPP entregado sin calificar -- se dejaria a alguien "desvinculado"
  // con equipos fantasma en el sistema. La salida para casos sin otra
  // opcion es calificar el item como "No devolvió" (no bloquea el cierre).
  if (
    workflowRequest.tipo === 'offboarding' &&
    workflowRequest.estado === 'equipo_recibido' &&
    nuevoEstado === 'consolidacion_cierre'
  ) {
    // "no_devuelto" deja la asignacion activa a proposito (el empleado se
    // quedo con el equipo) -- no cuenta como pendiente de calificar, solo
    // lo que todavia no tiene ningun estadoDevolucion registrado.
    const asignacionesActivas = await prisma.assignment.count({
      where: { employeeId: workflowRequest.employeeId, activo: true, estadoDevolucion: null },
    });
    const eppPendiente = await prisma.kitAssignment.count({
      where: {
        employeeId: workflowRequest.employeeId,
        estado: 'entregado',
        item: { categoria: 'epp' },
      },
    });
    if (asignacionesActivas > 0 || eppPendiente > 0) {
      throw new ValidationError(
        'Todavía hay equipos o EPP sin calificar para este empleado. Califica cada uno (o márcalo como "No devolvió") antes de cerrar el ticket.'
      );
    }
  }

  if (
    workflowRequest.tipo === 'cambio_equipo' &&
    workflowRequest.estado === 'incidencia_detectada' &&
    nuevoEstado === 'cambio_ejecutado' &&
    datosAccion?.oldAssignmentId &&
    !datosAccion?.estadoDevolucion
  ) {
    throw new ValidationError(
      'Falta indicar el estado del equipo que se devuelve (buen estado, dañado o no devolvió)'
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    // Se "reclama" la solicitud en el estado que se valido arriba (R1,
    // auditoria 27-sep-2026). Con un doble clic o dos pestañas, la segunda
    // transicion espera el bloqueo de la fila y despues ya no la encuentra
    // en ese estado: se rechaza en vez de repetir entregas y devoluciones.
    const { count } = await tx.workflowRequest.updateMany({
      where: { id, estado: workflowRequest.estado, updatedAt: workflowRequest.updatedAt },
      data: { updatedAt: new Date() },
    });
    if (count !== 1) {
      throw new ConflictError(
        'La solicitud cambió mientras la procesabas. Recarga la página y revisa su estado.'
      );
    }

    const assignmentIds: string[] = [...workflowRequest.assignmentIds];
    const kitReturnIds: string[] = [...workflowRequest.kitReturnIds];
    // Por defecto la transicion avanza al estado pedido; el bloque de
    // offboarding mas abajo puede dejarlo en el estado actual si todavia
    // queda equipo/EPP sin calificar.
    let estadoFinalEfectivo: EstadoSolicitud = nuevoEstado;

    // Execute side effects based on transition
    if (
      workflowRequest.tipo === 'onboarding' &&
      workflowRequest.estado === 'gestion_ti' &&
      (nuevoEstado === 'equipos_entregados' || nuevoEstado === 'gestion_ti')
    ) {
      // Create assignments for selected assets (entrega total o parcial)
      const assets = (datosAccion?.assetIds as string[]) || [];
      const condicionCargadorPorAsset =
        (datosAccion?.condicionCargador as
          | Record<string, { condicion: unknown; observaciones?: string }>
          | undefined) || {};
      for (const assetId of assets) {
        const cargadorCrudo = condicionCargadorPorAsset[assetId];
        const cargador = cargadorCrudo && {
          condicion: leerCondicionCargador(cargadorCrudo.condicion),
          observaciones: cargadorCrudo.observaciones,
        };
        const assignment = await executeAssignment(tx, {
          sedeId: workflowRequest.sedeId,
          assetId,
          employeeId: workflowRequest.employeeId,
          fechaEntrega: new Date(),
          lugarEntrega: (datosAccion?.lugarEntrega as string) || null,
          entregadoPor: systemUser.nombre,
          tipoMovimiento: 'ingreso',
          motivo: `Onboarding - ${workflowRequest.numero}`,
          condicionCargadorEntrega: cargador?.condicion || null,
          observacionesCargador: cargador?.observaciones || null,
        });
        assignmentIds.push(assignment.id);
      }
    }

    if (
      workflowRequest.tipo === 'onboarding' &&
      workflowRequest.estado === 'gestion_ti' &&
      nuevoEstado === 'equipos_entregados'
    ) {
      // Coordinacion de entrega: fecha/hora y, segun el medio, el lugar
      // (presencial) o la OT de despacho (Chilexpress).
      await tx.workflowRequest.update({
        where: { id },
        data: {
          fechaEntregaCoordinada: datosAccion?.fechaEntregaCoordinada
            ? new Date(datosAccion.fechaEntregaCoordinada as string)
            : undefined,
          medioEntrega: (datosAccion?.medioEntrega as string) || undefined,
          lugarEntrega: (datosAccion?.lugarEntrega as string) || undefined,
          otChilexpressEntrega: (datosAccion?.otChilexpressEntrega as string) || undefined,
          ciudadEntrega: (datosAccion?.ciudadEntrega as string) || undefined,
        },
      });
    }

    if (
      workflowRequest.tipo === 'cambio_equipo' &&
      workflowRequest.estado === 'incidencia_detectada' &&
      nuevoEstado === 'cambio_ejecutado'
    ) {
      // Coordinacion del cambio: fecha/hora y, segun el medio, el lugar
      // (presencial) o la OT + ciudad de despacho (Chilexpress).
      await tx.workflowRequest.update({
        where: { id },
        data: {
          medioCambio: (datosAccion?.medioCambio as string) || undefined,
          fechaCambioCoordinada: datosAccion?.fechaCambioCoordinada
            ? new Date(datosAccion.fechaCambioCoordinada as string)
            : undefined,
          lugarCambio: (datosAccion?.lugarCambio as string) || undefined,
          otCambioChilexpress: (datosAccion?.otCambioChilexpress as string) || undefined,
          ciudadCambio: (datosAccion?.ciudadCambio as string) || undefined,
        },
      });
    }

    if (
      workflowRequest.tipo === 'cambio_equipo' &&
      workflowRequest.estado === 'incidencia_detectada' &&
      nuevoEstado === 'cambio_ejecutado'
    ) {
      // Return old asset and assign new one
      const oldAssignmentId = datosAccion?.oldAssignmentId as string | undefined;
      const newAssetId = datosAccion?.newAssetId as string | undefined;

      // Condicion del cargador: solo se guarda si el equipo es un
      // notebook con tieneCargador. "Anterior" es el del equipo que se
      // devuelve; "Nuevo" el del equipo de reemplazo.
      const condicionCargadorAnterior = leerCondicionCargador(
        datosAccion?.condicionCargadorAnterior
      );
      const observacionesCargadorAnterior =
        (datosAccion?.observacionesCargadorAnterior as string) || null;
      const condicionCargadorNuevo = leerCondicionCargador(datosAccion?.condicionCargadorNuevo);
      const observacionesCargadorNuevo =
        (datosAccion?.observacionesCargadorNuevo as string) || null;

      if (oldAssignmentId) {
        const estadoDevolucionViejo = datosAccion?.estadoDevolucion as
          | 'ok'
          | 'danado'
          | 'no_devuelto';
        const observacionesViejo = (datosAccion?.observacionesDevolucion as string) || null;
        await executeReturn(tx, {
          assignmentId: oldAssignmentId,
          fechaDevolucion: new Date(),
          recibidoPor: systemUser.nombre,
          estadoDevolucion: estadoDevolucionViejo,
          contexto: 'cambio',
          observacionesDevolucion: observacionesViejo
            ? `Cambio de equipo - ${workflowRequest.numero}: ${observacionesViejo}`
            : `Cambio de equipo - ${workflowRequest.numero}`,
          condicionCargadorDevolucion: condicionCargadorAnterior || null,
          observacionesCargador: observacionesCargadorAnterior,
          expectedEmployeeId: workflowRequest.employeeId,
        });
        assignmentIds.push(oldAssignmentId);
      }

      if (newAssetId) {
        const assignment = await executeAssignment(tx, {
          sedeId: workflowRequest.sedeId,
          assetId: newAssetId,
          employeeId: workflowRequest.employeeId,
          fechaEntrega: new Date(),
          lugarEntrega: (datosAccion?.lugarEntrega as string) || null,
          entregadoPor: systemUser.nombre,
          tipoMovimiento: 'cambio',
          motivo: workflowRequest.motivoCambio || `Cambio - ${workflowRequest.numero}`,
          condicionCargadorEntrega: condicionCargadorNuevo || null,
          observacionesCargador: observacionesCargadorNuevo,
        });
        assignmentIds.push(assignment.id);
      }
    }

    if (
      workflowRequest.tipo === 'offboarding' &&
      workflowRequest.estado === 'solicitud_emitida' &&
      nuevoEstado === 'equipo_recibido'
    ) {
      // Coordinacion de la devolucion: fecha/hora y, segun el medio, el
      // lugar (presencial) o la OT + ciudad de despacho (Chilexpress).
      // Permite completar o actualizar estos datos si cambiaron.
      await tx.workflowRequest.update({
        where: { id },
        data: {
          medioDevolucion: (datosAccion?.medioDevolucion as string) || undefined,
          fechaDevolucionCoordinada: datosAccion?.fechaDevolucionCoordinada
            ? new Date(datosAccion.fechaDevolucionCoordinada as string)
            : undefined,
          lugarDevolucion: (datosAccion?.lugarDevolucion as string) || undefined,
          otChilexpress: (datosAccion?.otChilexpress as string) || undefined,
          ciudadDevolucion: (datosAccion?.ciudadDevolucion as string) || undefined,
        },
      });
    }

    if (
      workflowRequest.tipo === 'offboarding' &&
      workflowRequest.estado === 'solicitud_emitida' &&
      nuevoEstado === 'equipo_recibido'
    ) {
      // Recepcion de equipos: califica cada asignacion activa del
      // empleado individualmente via executeReturn (deja el activo en
      // "baja" si esta danado, "disponible" si esta ok). El EPP se
      // devuelve igual con executeKitReturn (el Kit de Bienvenida no se
      // devuelve, es consumible).
      const devoluciones =
        (datosAccion?.devoluciones as
          | {
              assignmentId: string;
              estadoDevolucion: 'ok' | 'danado' | 'no_devuelto';
              observaciones?: string;
              // Condicion del cargador (se valida con leerCondicionCargador).
              condicionCargador?: unknown;
              observacionesCargador?: string;
            }[]
          | undefined) || [];
      for (const dev of devoluciones) {
        await executeReturn(tx, {
          assignmentId: dev.assignmentId,
          fechaDevolucion: new Date(),
          recibidoPor: systemUser.nombre,
          estadoDevolucion: dev.estadoDevolucion,
          observacionesDevolucion: dev.observaciones || null,
          condicionCargadorDevolucion: leerCondicionCargador(dev.condicionCargador) || null,
          observacionesCargador: dev.observacionesCargador || null,
          expectedEmployeeId: workflowRequest.employeeId,
        });
        assignmentIds.push(dev.assignmentId);
      }

      const devolucionesEpp =
        (datosAccion?.devolucionesEpp as
          | {
              kitAssignmentId: string;
              estadoDevolucion: 'ok' | 'danado' | 'no_devuelto';
              observaciones?: string;
            }[]
          | undefined) || [];
      for (const dev of devolucionesEpp) {
        await executeKitReturn(tx, {
          kitAssignmentId: dev.kitAssignmentId,
          estadoDevolucion: dev.estadoDevolucion,
          recibidoPor: systemUser.nombre,
          observaciones: dev.observaciones || null,
          expectedEmployeeId: workflowRequest.employeeId,
        });
        kitReturnIds.push(dev.kitAssignmentId);
      }

      // Si con lo recien calificado todavia queda equipo activo o EPP
      // entregado sin resolver, el ticket se queda abierto en
      // solicitud_emitida en vez de saltar a equipo_recibido -- lo ya
      // calificado no se pierde, solo no se cierra la etapa.
      const asignacionesActivasRestantes = await tx.assignment.findMany({
        where: {
          employeeId: workflowRequest.employeeId,
          activo: true,
          estadoDevolucion: null,
        },
        select: { id: true },
      });
      const eppPendienteRestante = await tx.kitAssignment.findMany({
        where: {
          employeeId: workflowRequest.employeeId,
          estado: 'entregado',
          item: { categoria: 'epp' },
        },
        select: { id: true },
      });
      if (asignacionesActivasRestantes.length > 0 || eppPendienteRestante.length > 0) {
        // El ticket se queda en "solicitud_emitida" hasta calificar todo.
        estadoFinalEfectivo = 'solicitud_emitida';
      }
    }

    // Update the request state
    const isFinal = isFinalState(workflowRequest.tipo, estadoFinalEfectivo);
    const updated = await tx.workflowRequest.update({
      where: { id },
      data: {
        estado: estadoFinalEfectivo,
        assignmentIds,
        kitReturnIds,
        ...(isFinal && { fechaCierre: new Date() }),
      },
      include: {
        employee: true,
        solicitante: { select: { nombre: true, rol: true } },
        responsableActual: { select: { nombre: true, rol: true } },
      },
    });

    // Al cerrar un offboarding, el empleado pasa a desvinculado -- ya no
    // trabaja en la empresa, y los equipos que tenia ya quedaron libres
    // (disponible/baja) en el paso de recepcion de equipos.
    if (isFinal && workflowRequest.tipo === 'offboarding') {
      await tx.employee.update({
        where: { id: workflowRequest.employeeId },
        data: { estado: 'desvinculado' },
      });
    }

    // Log the transition
    await tx.workflowTransition.create({
      data: {
        requestId: id,
        estadoAnterior: workflowRequest.estado,
        estadoNuevo: estadoFinalEfectivo,
        ejecutadoPorId: systemUser.id,
        comentario:
          comentario ||
          (esEntregaParcialOnboarding
            ? 'Entrega parcial de equipos'
            : estadoFinalEfectivo !== nuevoEstado
              ? 'Recepción parcial de equipos/EPP - ticket queda abierto hasta calificar todo'
              : undefined),
        datosAccion: datosAccion
          ? (datosAccion as Record<string, string | number | boolean | null>)
          : undefined,
      },
    });

    return updated;
  });

  return result;
}
