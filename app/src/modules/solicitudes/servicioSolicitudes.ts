import { prisma } from '@/shared/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errores';
import type { EntregarKitItemsInput, MarcarKitItemNoAplicaInput } from '@/modules/kit-epp';
import { executeKitDelivery } from '@/modules/solicitudes/ejecucion';
import type {
  CancelWorkflowRequestInput,
  CreateCommentInput,
  UpdatePendienteInput,
  UpdateWorkflowRequestInput,
} from '@/modules/solicitudes/validaciones';

/**
 * Acciones sobre una solicitud que no son pasos del flujo (esos van en
 * transicion.ts): datos, cancelacion, comentarios, pendientes y Kit/EPP.
 */

/** Quien hace la accion. */
type Usuario = { id: string; nombre: string };

async function buscarSolicitud(id: string) {
  const solicitud = await prisma.workflowRequest.findUnique({ where: { id } });
  if (!solicitud) throw new NotFoundError('Solicitud no encontrada');
  return solicitud;
}

const CON_PERSONAS = {
  employee: true,
  solicitante: { select: { nombre: true, rol: true } },
  responsableActual: { select: { nombre: true, rol: true } },
} as const;

/** Cambiar el responsable, las observaciones o el ID del ticket (PATCH /api/solicitudes/[id]). */
export async function actualizarSolicitud(id: string, data: UpdateWorkflowRequestInput) {
  await buscarSolicitud(id);
  return prisma.workflowRequest.update({
    where: { id },
    data: {
      ...(data.responsableActualId !== undefined && { responsableActualId: data.responsableActualId }),
      ...(data.observaciones !== undefined && { observaciones: data.observaciones }),
      ...(data.idTicket !== undefined && { idTicket: data.idTicket }),
    },
    include: CON_PERSONAS,
  });
}

/**
 * Cancelar una solicitud que todavia no ejecuto nada sobre el inventario
 * (assignmentIds y kitReturnIds vacios). No pasa por canTransition: no es un
 * paso del flujo, sino que el ticket no debio existir o ya no corresponde.
 */
export async function cancelarSolicitud(id: string, { motivo }: CancelWorkflowRequestInput, usuario: Usuario) {
  const solicitud = await buscarSolicitud(id);
  if (solicitud.fechaCierre) throw new ConflictError('Esta solicitud ya está cerrada, no se puede cancelar');
  // Si ya asigno o devolvio equipo o entrego Kit/EPP, cancelar dejaria el
  // inventario inconsistente: hay que revertir esas acciones a mano antes.
  if (solicitud.assignmentIds.length > 0 || solicitud.kitReturnIds.length > 0) {
    throw new ConflictError(
      'Esta solicitud ya ejecutó acciones sobre el inventario (asignó o devolvió equipo/EPP); no se puede cancelar directamente. Revierte esas acciones primero.'
    );
  }

  return prisma.$transaction(async (tx) => {
    // Misma condicion que se valido arriba: si otra persona la avanzo en el
    // intertanto, no se cancela a ciegas (R1).
    const { count } = await tx.workflowRequest.updateMany({
      where: { id, updatedAt: solicitud.updatedAt, fechaCierre: null },
      data: { updatedAt: new Date() },
    });
    if (count !== 1) {
      throw new ConflictError('La solicitud cambió mientras la cancelabas. Recarga la página y revisa su estado.');
    }
    const cancelada = await tx.workflowRequest.update({
      where: { id },
      data: { estado: 'cancelada', fechaCierre: new Date() },
      include: CON_PERSONAS,
    });
    await tx.workflowTransition.create({
      data: {
        requestId: id,
        estadoAnterior: solicitud.estado,
        estadoNuevo: 'cancelada',
        ejecutadoPorId: usuario.id,
        comentario: `Cancelada: ${motivo}`,
      },
    });
    return cancelada;
  });
}

/** Agregar un comentario a una solicitud. */
export async function comentarSolicitud(id: string, data: CreateCommentInput, usuario: Usuario) {
  await buscarSolicitud(id);
  return prisma.workflowComment.create({
    data: { requestId: id, autorId: usuario.id, mensaje: data.mensaje, esInterno: data.esInterno },
    include: { autor: { select: { nombre: true, rol: true } } },
  });
}

/** Cambiar el estado o la descripcion de un pendiente de la solicitud. */
export async function actualizarPendiente(
  id: string,
  pendienteId: string,
  data: UpdatePendienteInput,
  quien: string
) {
  const pendiente = await prisma.workflowPendiente.findFirst({ where: { id: pendienteId, requestId: id } });
  if (!pendiente) throw new NotFoundError('Pendiente no encontrado');
  return prisma.workflowPendiente.update({
    where: { id: pendienteId },
    data: {
      estado: data.estado,
      descripcion: data.descripcion !== undefined ? data.descripcion : undefined,
      actualizadoPor: quien,
    },
  });
}

/**
 * Entregar Kit de Bienvenida / EPP de un onboarding. Separado de las
 * transiciones: Kit/EPP no participa del avance de estados.
 */
export async function entregarKitSolicitud(id: string, datos: EntregarKitItemsInput, usuario: Usuario) {
  const solicitud = await buscarSolicitud(id);
  if (solicitud.tipo !== 'onboarding') {
    throw new ValidationError('Solo las solicitudes de onboarding entregan Kit de Bienvenida / EPP');
  }
  if (solicitud.estado === 'registro_rrhh') throw new ValidationError('La solicitud ya está cerrada');

  const entregas = await prisma.$transaction(async (tx) => {
    const hechas = [];
    for (const { itemId, cantidad } of datos.items) {
      hechas.push(
        await executeKitDelivery(tx, {
          sedeId: solicitud.sedeId,
          itemId,
          cantidad,
          employeeId: solicitud.employeeId,
          requestId: solicitud.id,
          entregadoPor: usuario.nombre,
        })
      );
    }
    return hechas;
  });
  return { entregas };
}

/**
 * Marcar un articulo requerido como "No aplica": la salida para cerrar el
 * ticket cuando no se puede entregar (sin stock, no corresponde al puesto...).
 */
export async function marcarKitNoAplica(id: string, datos: MarcarKitItemNoAplicaInput, usuario: Usuario) {
  const solicitud = await buscarSolicitud(id);
  if (solicitud.estado === 'registro_rrhh') throw new ValidationError('La solicitud ya está cerrada');
  const requerido = await prisma.requestKitItem.findUnique({ where: { id: datos.requestKitItemId } });
  if (!requerido || requerido.requestId !== id) {
    throw new NotFoundError('Artículo requerido no encontrado para esta solicitud');
  }
  if (requerido.estado !== 'pendiente') {
    throw new ConflictError('Ese artículo ya fue resuelto (entregado o marcado como no aplica)');
  }
  return prisma.requestKitItem.update({
    where: { id: requerido.id },
    data: { estado: 'no_aplica', motivoNoAplica: datos.motivo, resueltoPor: usuario.nombre, resueltoEn: new Date() },
    include: { item: true },
  });
}
