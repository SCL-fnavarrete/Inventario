import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '@/shared/errores';

/**
 * Entregar y devolver Kit de Bienvenida / EPP (SPEC 2.118: Kit/EPP es el
 * unico que escribe su stock y sus entregas). Lo usan las Solicitudes.
 */

type PrismaTx = Prisma.TransactionClient;

export type ExecuteKitDeliveryParams = {
  itemId: string;
  cantidad: number;
  employeeId: string;
  requestId: string;
  entregadoPor?: string | null;
  // Sede de la solicitud: el stock de Kit/EPP es por sede (SPEC 2.114).
  sedeId: string | null;
};

export type ExecuteKitReturnParams = {
  kitAssignmentId: string;
  estadoDevolucion: 'ok' | 'danado' | 'no_devuelto';
  recibidoPor?: string | null;
  observaciones?: string | null;
  // Mismo chequeo que en ExecuteReturnParams, para EPP.
  expectedEmployeeId?: string;
};

/**
 * Entrega articulos de Kit de Bienvenida / EPP: descuenta el stock del
 * articulo y deja registro en KitAssignment ligado a la solicitud. A
 * diferencia de executeAssignment (Activos), no hay una unidad fisica
 * individual que cambie de estado -- es un conteo simple que baja.
 */
export async function entregarKit(tx: PrismaTx, params: ExecuteKitDeliveryParams) {
  const item = await tx.welcomeKitItem.findUnique({ where: { id: params.itemId } });
  // Un articulo de otra sede se trata como inexistente (auditoria 27-sep-2026,
  // A01-2): antes se podia vaciar el stock de otra sede llamando a la API.
  if (!item || item.sedeId !== params.sedeId) throw new NotFoundError('Artículo de Kit/EPP no encontrado');

  const employee = await tx.employee.findUnique({ where: { id: params.employeeId } });
  if (!employee) throw new NotFoundError('Empleado no encontrado');

  // Descuento condicionado: solo baja si todavia alcanza. Dos entregas
  // simultaneas ya no pueden dejar el stock negativo (R3): la segunda no
  // encuentra la fila con stock suficiente y se rechaza.
  const { count } = await tx.welcomeKitItem.updateMany({
    where: { id: params.itemId, sedeId: params.sedeId, cantidad: { gte: params.cantidad } },
    data: { cantidad: { decrement: params.cantidad } },
  });
  if (count !== 1) {
    const actual = await tx.welcomeKitItem.findUnique({ where: { id: params.itemId }, select: { cantidad: true } });
    throw new ConflictError(
      `Stock insuficiente de "${item.nombre}": quedan ${actual?.cantidad ?? 0}, se pidieron ${params.cantidad}`
    );
  }

  const kitAssignment = await tx.kitAssignment.create({
    data: {
      itemId: params.itemId,
      employeeId: params.employeeId,
      requestId: params.requestId,
      cantidad: params.cantidad,
      fechaEntrega: new Date(),
      estado: 'entregado',
      observaciones: params.entregadoPor ? `Entregado por ${params.entregadoPor}` : null,
    },
    include: { item: true },
  });


  return kitAssignment;
}

/**
 * Devuelve un articulo de EPP entregado (KitAssignment). A diferencia de
 * executeReturn (Activos), no hay una unidad fisica individual que quede
 * "en baja" -- si vuelve en buen estado, el stock del articulo se repone
 * (queda disponible para entregar de nuevo); si vuelve danado/perdido, no
 * se repone, igual que un Activo que queda en "baja". El Kit de Bienvenida
 * no pasa por aca -- es consumible, no se devuelve.
 */
export async function executeKitReturn(tx: PrismaTx, params: ExecuteKitReturnParams) {
  const kitAssignment = await tx.kitAssignment.findUnique({
    where: { id: params.kitAssignmentId },
    include: { item: true },
  });
  if (!kitAssignment) throw new NotFoundError('Entrega de Kit/EPP no encontrada');
  if (params.expectedEmployeeId && kitAssignment.employeeId !== params.expectedEmployeeId) {
    throw new ConflictError('Ese artículo no está entregado a este empleado');
  }
  if (kitAssignment.estado !== 'entregado')
    throw new ConflictError(`El artículo "${kitAssignment.item.nombre}" ya fue devuelto`);

  // "no_devuelto" es su propio estado, distinto de "perdido": el empleado
  // se quedo con el articulo (se sabe donde esta), no se perdio. Ninguno de
  // los dos repone stock -- el articulo no volvio al parque disponible.
  const nuevoEstado: 'devuelto' | 'perdido' | 'no_devuelto' =
    params.estadoDevolucion === 'ok'
      ? 'devuelto'
      : params.estadoDevolucion === 'no_devuelto'
        ? 'no_devuelto'
        : 'perdido';

  const etiquetaEstado =
    params.estadoDevolucion === 'danado'
      ? 'dañado'
      : params.estadoDevolucion === 'no_devuelto'
        ? 'no devuelto'
        : 'buen estado';
  const notaDevolucion = `Devuelto (${etiquetaEstado})${
    params.observaciones ? `: ${params.observaciones}` : ''
  }${params.recibidoPor ? ` — recibido por ${params.recibidoPor}` : ''}`;

  // Condicion sobre el estado: dos devoluciones simultaneas del mismo
  // articulo ya no suman el stock dos veces (auditoria 27-sep-2026).
  const { count } = await tx.kitAssignment.updateMany({
    where: { id: params.kitAssignmentId, estado: 'entregado' },
    data: { estado: nuevoEstado },
  });
  if (count !== 1) throw new ConflictError(`El artículo "${kitAssignment.item.nombre}" ya fue devuelto`);

  const actualizado = await tx.kitAssignment.update({
    where: { id: params.kitAssignmentId },
    data: {
      estado: nuevoEstado,
      observaciones: kitAssignment.observaciones
        ? `${kitAssignment.observaciones} · ${notaDevolucion}`
        : notaDevolucion,
    },
    include: { item: true },
  });

  if (nuevoEstado === 'devuelto') {
    await tx.welcomeKitItem.update({
      where: { id: kitAssignment.itemId },
      data: { cantidad: { increment: kitAssignment.cantidad } },
    });
  }

  return actualizado;
}
