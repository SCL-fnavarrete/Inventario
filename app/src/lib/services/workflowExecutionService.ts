import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '@/lib/errors';

type PrismaTx = Prisma.TransactionClient;

export type ExecuteAssignmentParams = {
  assetId: string;
  employeeId: string;
  fechaEntrega: Date;
  lugarEntrega?: string | null;
  entregadoPor?: string | null;
  tipoMovimiento: 'ingreso' | 'cambio' | 'reemplazo' | 'temporal';
  motivo?: string | null;
  // Nombre de red del equipo (hostname). Se define al ENTREGAR, no al crear
  // el activo, porque se arma con el nombre de quien lo va a usar -- un
  // equipo en bodega todavia no tiene nombre (15-sep-2026, SPEC 2.40). Si
  // no viene, el activo conserva el que ya tenia.
  nombreEquipo?: string | null;
  // Condicion del cargador al momento de la entrega -- solo se usa si el
  // activo es un notebook con tieneCargador = true; para el resto se
  // ignora silenciosamente (ver SPEC 2.5.3 regla 9). No es un activo
  // propio, no afecta el estado del Activo.
  condicionCargadorEntrega?: 'ok' | 'danado' | 'no_aplica' | null;
  observacionesCargador?: string | null;
};

export type ExecuteReturnParams = {
  assignmentId: string;
  fechaDevolucion: Date;
  recibidoPor?: string | null;
  estadoDevolucion: 'ok' | 'danado' | 'incompleto' | 'no_devuelto';
  observacionesDevolucion?: string | null;
  // Si se pasa, se exige que la asignacion sea de este empleado -- evita que
  // un offboarding/cambio de equipo de una persona devuelva por error (o a
  // proposito, via API directa) el equipo de otra.
  expectedEmployeeId?: string;
};

export type ExecuteTerminationReturnParams = {
  terminationId: string;
  fechaDevolucionEquipos: Date;
  estadoNotebook: 'ok' | 'danado' | 'no_aplica' | 'pendiente';
  estadoCelular: 'ok' | 'danado' | 'no_aplica' | 'pendiente';
  estadoMonitor: 'ok' | 'danado' | 'no_aplica' | 'pendiente';
  estadoKit: 'ok' | 'danado' | 'no_aplica' | 'pendiente';
  recibidoPor: string;
  lugarDevolucion: string;
  requiereDescuento?: boolean;
  montoDescuento?: number | null;
  motivoDescuento?: string | null;
  observaciones?: string | null;
};

export type ExecuteKitDeliveryParams = {
  itemId: string;
  cantidad: number;
  employeeId: string;
  requestId: string;
  entregadoPor?: string | null;
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
export async function executeKitDelivery(tx: PrismaTx, params: ExecuteKitDeliveryParams) {
  const item = await tx.welcomeKitItem.findUnique({ where: { id: params.itemId } });
  if (!item) throw new NotFoundError('Artículo de Kit/EPP no encontrado');
  if (item.cantidad < params.cantidad) {
    throw new ConflictError(
      `Stock insuficiente de "${item.nombre}": quedan ${item.cantidad}, se pidieron ${params.cantidad}`
    );
  }

  const employee = await tx.employee.findUnique({ where: { id: params.employeeId } });
  if (!employee) throw new NotFoundError('Empleado no encontrado');

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

  await tx.welcomeKitItem.update({
    where: { id: params.itemId },
    data: { cantidad: { decrement: params.cantidad } },
  });

  // Si este articulo estaba en la lista de requeridos de la solicitud
  // (RequestKitItem), la entrega lo resuelve automaticamente -- asi el
  // tecnico no tiene que marcarlo aparte para poder cerrar el ticket.
  if (params.requestId) {
    await tx.requestKitItem.updateMany({
      where: { requestId: params.requestId, itemId: params.itemId, estado: 'pendiente' },
      data: {
        estado: 'entregado',
        resueltoPor: params.entregadoPor || null,
        resueltoEn: new Date(),
      },
    });
  }

  return kitAssignment;
}

/**
 * Creates an assignment and updates the asset state. Reusable from both
 * the direct POST /api/asignaciones route and the workflow transition endpoint.
 */
export async function executeAssignment(
  tx: PrismaTx,
  params: ExecuteAssignmentParams
) {
  const asset = await tx.asset.findUnique({
    where: { id: params.assetId },
    include: { categoria: true },
  });

  if (!asset) throw new NotFoundError('Activo no encontrado');
  // 15-sep-2026 (SPEC 2.40): "disponible" es el unico estado asignable,
  // desde que se elimino "reutilizable" (era indistinguible de disponible a
  // la hora de entregar, y solo servia para que el equipo devuelto no
  // contara como stock en el Dashboard).
  if (asset.estado !== 'disponible') {
    throw new ConflictError(`El activo no está disponible. Estado actual: ${asset.estado}`);
  }

  const employee = await tx.employee.findUnique({
    where: { id: params.employeeId },
  });

  if (!employee) throw new NotFoundError('Empleado no encontrado');
  if (employee.estado !== 'activo')
    throw new ConflictError(
      `No se puede entregar equipo a ${employee.nombres} ${employee.apellidoPaterno}: su estado es "${employee.estado}"`
    );

  // Solo se guarda si el activo realmente es un notebook con cargador --
  // si se manda por error para otra categoria (o un notebook sin cargador),
  // se ignora en silencio en vez de dejar un dato sin sentido en el acta.
  const aplicaCargador = asset.tieneCargador;

  const assignment = await tx.assignment.create({
    data: {
      assetId: params.assetId,
      employeeId: params.employeeId,
      fechaEntrega: params.fechaEntrega,
      lugarEntrega: params.lugarEntrega,
      entregadoPor: params.entregadoPor,
      tipoMovimiento: params.tipoMovimiento,
      motivo: params.motivo,
      activo: true,
      ...(aplicaCargador && {
        condicionCargadorEntrega: params.condicionCargadorEntrega || null,
        observacionesCargador: params.observacionesCargador || null,
      }),
    },
    include: {
      asset: { include: { categoria: true } },
      employee: true,
    },
  });

  await tx.asset.update({
    where: { id: params.assetId },
    data: {
      estado: 'asignado',
      empleadoActualId: params.employeeId,
      // Solo se pisa si la entrega trae un nombre: si el tecnico lo dejo en
      // blanco, el equipo conserva el que ya tenia.
      ...(params.nombreEquipo ? { nombreEquipo: params.nombreEquipo } : {}),
    },
  });

  await tx.assetHistory.create({
    data: {
      assetId: params.assetId,
      tipoEvento: 'asignacion',
      descripcion: `Asignado a ${employee.nombres} ${employee.apellidoPaterno} (${employee.rut || '—'})`,
      datosAnteriores: { estado: asset.estado, empleadoActualId: asset.empleadoActualId },
      datosNuevos: { estado: 'asignado', empleadoActualId: params.employeeId },
      usuarioSistema: params.entregadoPor || 'Sistema',
    },
  });

  return assignment;
}

/**
 * Processes a single assignment return.
 */
export async function executeReturn(tx: PrismaTx, params: ExecuteReturnParams) {
  const assignment = await tx.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { asset: true, employee: true },
  });

  if (!assignment) throw new NotFoundError('Asignación no encontrada');

  if (params.expectedEmployeeId && assignment.employeeId !== params.expectedEmployeeId) {
    throw new ConflictError('Ese equipo no está asignado a este empleado');
  }

  // Sin esta comprobacion se podia devolver dos veces el mismo equipo: la
  // segunda devolucion sobreescribia la fecha y el estado de la primera. La
  // ruta PUT ya lo verificaba por su cuenta; esta funcion, que es la que usa
  // el flujo de solicitudes, no. Un "no_devuelto" deja la asignacion activa
  // a proposito (ver abajo), asi que sigue pudiendose calificar de nuevo --
  // eso es lo que permite recuperarla mas adelante (desde Asignaciones,
  // p.ej.) cuando el equipo aparece.
  if (!assignment.activo) throw new ConflictError('Esta asignación ya fue devuelta');

  // "no_devuelto": el empleado no entrego el equipo, asi que no hay
  // devolucion fisica que registrar -- la asignacion NO se cierra (sigue
  // activa) y el Activo NO cambia de estado ni de dueño: sigue figurando
  // como asignado a esta persona, que es la realidad (se lo quedo). Antes
  // esto se trataba igual que "danado" y mandaba el Activo a "baja", lo
  // cual descontaba el equipo del empleado en el sistema pese a que nunca
  // se recupero -- quedaba invisible en vez de pendiente de gestionar. Si
  // el equipo aparece despues, se devuelve normalmente desde Asignaciones
  // (la asignacion sigue activa, ese flujo funciona igual que con cualquier
  // otra asignacion vigente).
  if (params.estadoDevolucion === 'no_devuelto') {
    const actualizada = await tx.assignment.update({
      where: { id: params.assignmentId },
      data: {
        recibidoPor: params.recibidoPor,
        estadoDevolucion: params.estadoDevolucion,
        observacionesDevolucion: params.observacionesDevolucion,
      },
      include: {
        asset: { include: { categoria: true } },
        employee: true,
      },
    });

    await tx.assetHistory.create({
      data: {
        assetId: assignment.assetId,
        tipoEvento: 'devolucion',
        descripcion: `${assignment.employee.nombres} ${assignment.employee.apellidoPaterno} no devolvió el equipo en su desvinculación. Sigue asignado a la espera de recuperarlo.`,
        datosAnteriores: {
          estado: assignment.asset.estado,
          empleadoActualId: assignment.asset.empleadoActualId,
        },
        datosNuevos: {
          estado: assignment.asset.estado,
          empleadoActualId: assignment.asset.empleadoActualId,
          estadoDevolucion: params.estadoDevolucion,
        },
        usuarioSistema: params.recibidoPor || 'Sistema',
      },
    });

    return actualizada;
  }

  const actualizada = await tx.assignment.update({
    where: { id: params.assignmentId },
    data: {
      activo: false,
      fechaDevolucion: params.fechaDevolucion,
      recibidoPor: params.recibidoPor,
      estadoDevolucion: params.estadoDevolucion,
      observacionesDevolucion: params.observacionesDevolucion,
    },
    include: {
      asset: { include: { categoria: true } },
      employee: true,
    },
  });

  // Devolver en buen estado deja el equipo listo para entregar de nuevo:
  // vuelve directo a "disponible" (SPEC 2.40). Danado sigue yendo a baja.
  const nuevoEstado: 'disponible' | 'baja' = params.estadoDevolucion === 'danado' ? 'baja' : 'disponible';

  await tx.asset.update({
    where: { id: assignment.assetId },
    data: {
      estado: nuevoEstado,
      ...(params.estadoDevolucion === 'danado' && { condicion: 'danado' }),
      ...(params.estadoDevolucion === 'ok' && { condicion: 'usado' }),
      empleadoActualId: null,
      ...(nuevoEstado === 'baja' && { fechaBaja: new Date() }),
    },
  });

  await tx.assetHistory.create({
    data: {
      assetId: assignment.assetId,
      tipoEvento: 'devolucion',
      descripcion: `Devuelto por ${assignment.employee.nombres} ${assignment.employee.apellidoPaterno}. Estado: ${params.estadoDevolucion}`,
      datosAnteriores: {
        estado: assignment.asset.estado,
        empleadoActualId: assignment.asset.empleadoActualId,
      },
      datosNuevos: {
        estado: nuevoEstado,
        empleadoActualId: null,
        estadoDevolucion: params.estadoDevolucion,
      },
      usuarioSistema: params.recibidoPor || 'Sistema',
    },
  });

  // Se devuelve la asignacion ya actualizada, no la que se leyo al entrar:
  // esa todavia dice activo: true y sin fecha de devolucion.
  return actualizada;
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

/**
 * Processes a full termination return (all equipment for a terminated employee).
 */
export async function executeTerminationReturn(
  tx: PrismaTx,
  params: ExecuteTerminationReturnParams
) {
  const termination = await tx.termination.findUnique({
    where: { id: params.terminationId },
    include: {
      employee: {
        include: {
          assignments: {
            where: { activo: true },
            include: { asset: { include: { categoria: true } } },
          },
        },
      },
    },
  });

  if (!termination) throw new NotFoundError('Desvinculación no encontrada');

  const hayDanos =
    params.estadoNotebook === 'danado' ||
    params.estadoCelular === 'danado' ||
    params.estadoMonitor === 'danado';

  const updatedTermination = await tx.termination.update({
    where: { id: params.terminationId },
    data: {
      fechaDevolucionEquipos: params.fechaDevolucionEquipos,
      estadoNotebook: params.estadoNotebook,
      estadoCelular: params.estadoCelular,
      estadoMonitor: params.estadoMonitor,
      estadoKit: params.estadoKit,
      recibidoPor: params.recibidoPor,
      lugarDevolucion: params.lugarDevolucion,
      requiereDescuento: params.requiereDescuento || hayDanos,
      montoDescuento: params.montoDescuento,
      motivoDescuento: params.motivoDescuento,
      observaciones: params.observaciones,
    },
  });

  for (const assignment of termination.employee.assignments) {
    const categoryName = assignment.asset.categoria.nombre.toLowerCase();
    let estadoDevolucion: 'ok' | 'danado' | 'incompleto' = 'ok';

    if (categoryName === 'notebook') {
      estadoDevolucion = params.estadoNotebook === 'danado' ? 'danado' : 'ok';
    } else if (categoryName === 'celular') {
      estadoDevolucion = params.estadoCelular === 'danado' ? 'danado' : 'ok';
    } else if (categoryName === 'monitor') {
      estadoDevolucion = params.estadoMonitor === 'danado' ? 'danado' : 'ok';
    }

    await tx.assignment.update({
      where: { id: assignment.id },
      data: {
        activo: false,
        fechaDevolucion: params.fechaDevolucionEquipos,
        recibidoPor: params.recibidoPor,
        estadoDevolucion,
        observacionesDevolucion:
          `Devolución por desvinculación. ${params.observaciones || ''}`.trim(),
      },
    });

    let nuevoEstadoActivo: 'disponible' | 'baja' = 'disponible';
    if (estadoDevolucion === 'danado') nuevoEstadoActivo = 'baja';

    await tx.asset.update({
      where: { id: assignment.asset.id },
      data: {
        estado: nuevoEstadoActivo,
        condicion: estadoDevolucion === 'danado' ? 'danado' : 'usado',
        empleadoActualId: null,
      },
    });

    await tx.assetHistory.create({
      data: {
        assetId: assignment.asset.id,
        tipoEvento: 'devolucion',
        descripcion: `Devuelto por desvinculación de ${termination.employee.nombres} ${termination.employee.apellidoPaterno}. Estado: ${estadoDevolucion}`,
        datosAnteriores: {
          estado: assignment.asset.estado,
          empleadoActualId: assignment.asset.empleadoActualId,
        },
        datosNuevos: { estado: nuevoEstadoActivo, empleadoActualId: null },
        usuarioSistema: params.recibidoPor,
      },
    });
  }

  return updatedTermination;
}
