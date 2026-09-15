import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { transitionSchema } from '@/lib/validations/workflow';
import { canTransition, isFinalState } from '@/lib/services/workflowStateMachine';
import {
  executeAssignment,
  executeReturn,
  executeKitReturn,
} from '@/lib/services/workflowExecutionService';
import { SystemRole, EstadoSolicitud } from '@prisma/client';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';

// POST /api/solicitudes/[id]/transicion - Advance workflow state
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = transitionSchema.safeParse(body);
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const { nuevoEstado, comentario, datosAccion } = validationResult.data;

    // Find system user
    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Find the request
    const workflowRequest = await prisma.workflowRequest.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!workflowRequest) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    assertSedeAccess(session, workflowRequest.sedeId, 'Solicitud no encontrada');

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
        return NextResponse.json(
          { error: `No tiene permisos para gestionar equipos como ${systemUser.rol}` },
          { status: 403 }
        );
      }
    } else if (
      !canTransition(
        workflowRequest.tipo,
        workflowRequest.estado,
        nuevoEstado,
        systemUser.rol as SystemRole
      )
    ) {
      return NextResponse.json(
        {
          error: `Transición no permitida de ${workflowRequest.estado} a ${nuevoEstado} para rol ${systemUser.rol}`,
        },
        { status: 403 }
      );
    }

    // No se puede cerrar un onboarding si se pidio Kit de Bienvenida y/o EPP
    // pero todavia no se entrego nada de eso -- quedaria pendiente sin que
    // nada lo refleje una vez cerrado el ticket. Si la solicitud usa el
    // detalle articulo-por-articulo (RequestKitItem), se valida cada
    // articulo individual (pendiente bloquea, no_aplica no); si no, se cae
    // al chequeo antiguo por categoria (tickets creados antes de esa
    // funcionalidad).
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

      // Por categoria: si hay filas granulares (RequestKitItem) para esa
      // categoria puntual se usan esas (mas precisas); si no hay ninguna
      // (tipico cuando no habia stock al crear el ticket, o es un ticket
      // viejo) se cae al chequeo por booleano+entrega para esa categoria.
      // Nunca se ignora un booleano solo porque la OTRA categoria si tenga
      // detalle granular.
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
        return NextResponse.json(
          { error: `Falta entregar ${partes.join(' y ')} antes de cerrar el ticket` },
          { status: 400 }
        );
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
        return NextResponse.json(
          {
            error:
              'Todavía hay equipos o EPP sin calificar para este empleado. Califica cada uno (o márcalo como "No devolvió") antes de cerrar el ticket.',
          },
          { status: 400 }
        );
      }
    }

    if (
      workflowRequest.tipo === 'cambio_equipo' &&
      workflowRequest.estado === 'coordinando_cambio' &&
      nuevoEstado === 'cambio_ejecutado' &&
      datosAccion?.oldAssignmentId &&
      !datosAccion?.estadoDevolucion
    ) {
      return NextResponse.json(
        { error: 'Falta indicar el estado del equipo que se devuelve (buen estado, dañado o no devolvió)' },
        { status: 400 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
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
            | Record<string, { condicion: 'ok' | 'danado' | 'no_aplica'; observaciones?: string }>
            | undefined) || {};
        for (const assetId of assets) {
          const cargador = condicionCargadorPorAsset[assetId];
          const assignment = await executeAssignment(tx, {
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
        workflowRequest.estado === 'coordinando_entrega' &&
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
        nuevoEstado === 'coordinando_cambio'
      ) {
        // Coordinacion del cambio, ANTES de ejecutarlo: fecha/hora y, segun
        // el medio, el lugar (presencial) o la OT + ciudad de despacho
        // (Chilexpress). Simetrico a la coordinacion de entrega de
        // onboarding y a la de devolucion de offboarding, mas abajo.
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
        workflowRequest.estado === 'coordinando_cambio' &&
        nuevoEstado === 'cambio_ejecutado'
      ) {
        // Return old asset and assign new one
        const oldAssignmentId = datosAccion?.oldAssignmentId as string | undefined;
        const newAssetId = datosAccion?.newAssetId as string | undefined;

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
            observacionesDevolucion: observacionesViejo
              ? `Cambio de equipo - ${workflowRequest.numero}: ${observacionesViejo}`
              : `Cambio de equipo - ${workflowRequest.numero}`,
            expectedEmployeeId: workflowRequest.employeeId,
          });
          assignmentIds.push(oldAssignmentId);
        }

        if (newAssetId) {
          const assignment = await executeAssignment(tx, {
            assetId: newAssetId,
            employeeId: workflowRequest.employeeId,
            fechaEntrega: new Date(),
            lugarEntrega: (datosAccion?.lugarEntrega as string) || null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'cambio',
            motivo: workflowRequest.motivoCambio || `Cambio - ${workflowRequest.numero}`,
          });
          assignmentIds.push(assignment.id);
        }
      }

      if (
        workflowRequest.tipo === 'offboarding' &&
        workflowRequest.estado === 'solicitud_emitida' &&
        nuevoEstado === 'coordinacion_en_curso'
      ) {
        // Coordinacion de la devolucion, ANTES de recibir los equipos:
        // fecha/hora y, segun el medio, el lugar (presencial) o la OT +
        // ciudad de despacho (Chilexpress). medioDevolucion/otChilexpress/
        // ciudadDevolucion ya se podian llenar al crear el ticket -- esta
        // transicion los deja completar o actualizar si cambiaron.
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
        workflowRequest.estado === 'coordinacion_en_curso' &&
        nuevoEstado === 'equipo_recibido'
      ) {
        // Recepcion de equipos: se califica el estado de cada asignacion
        // activa del empleado de forma individual (no solo 3 categorias
        // fijas). Cada una se devuelve con executeReturn, que ya deja el
        // Activo en "baja" si esta danado o "disponible" si esta ok --
        // igual que en el flujo de Cambio de Equipo. El EPP entregado se
        // devuelve igual, con executeKitReturn (el Kit de Bienvenida no se
        // devuelve, es consumible).
        const devoluciones =
          (datosAccion?.devoluciones as
            | { assignmentId: string; estadoDevolucion: 'ok' | 'danado' | 'no_devuelto'; observaciones?: string }[]
            | undefined) || [];
        for (const dev of devoluciones) {
          await executeReturn(tx, {
            assignmentId: dev.assignmentId,
            fechaDevolucion: new Date(),
            recibidoPor: systemUser.nombre,
            estadoDevolucion: dev.estadoDevolucion,
            observacionesDevolucion: dev.observaciones || null,
            expectedEmployeeId: workflowRequest.employeeId,
          });
          assignmentIds.push(dev.assignmentId);
        }

        const devolucionesEpp =
          (datosAccion?.devolucionesEpp as
            | { kitAssignmentId: string; estadoDevolucion: 'ok' | 'danado' | 'no_devuelto'; observaciones?: string }[]
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
          estadoFinalEfectivo = 'coordinacion_en_curso';
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
          solicitante: { select: { id: true, nombre: true, rol: true } },
          responsableActual: { select: { id: true, nombre: true, rol: true } },
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
          datosAccion: datosAccion ? (datosAccion as Record<string, string | number | boolean | null>) : undefined,
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al avanzar solicitud');
  }
}
