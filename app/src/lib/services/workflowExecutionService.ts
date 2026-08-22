import { Prisma } from '@prisma/client';
import { ServiceConflictError, ServiceNotFoundError } from '@/lib/errors/serviceOperationError';
import {
  OfficialDeliveryEvidence,
  OfficialReturnEvidence,
  pngSignatureSchema,
  policyAcceptanceSchema,
} from '@/lib/validations/signature';

type PrismaTx = Prisma.TransactionClient;

/** Created by an API transaction, never parsed from client input. */
export type ServerEvidenceContext = {
  eventTimestamp?: Date;
  expectedEmployeeId?: string;
  terminationId?: string;
};

export type ExecuteAssignmentParams = {
  assetId: string;
  employeeId: string;
  fechaEntrega: Date;
  lugarEntrega?: string | null;
  entregadoPor?: string | null;
  tipoMovimiento: 'ingreso' | 'cambio' | 'reemplazo' | 'temporal';
  motivo?: string | null;
} & OfficialDeliveryEvidence;

export type ExecuteReturnParams = {
  assignmentId: string;
  fechaDevolucion: Date;
  recibidoPor?: string | null;
  estadoDevolucion: 'ok' | 'danado' | 'incompleto';
  observacionesDevolucion?: string | null;
} & OfficialReturnEvidence;

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
} & OfficialReturnEvidence;

export type AssignmentEvidenceForDocument =
  | {
      tipo: 'entrega';
      assignmentId: string;
      employeeId: string;
      firmaEmpleado: string;
      firmaEmpleadoEn: Date;
      aceptaPoliticaUso: true;
    }
  | {
      tipo: 'devolucion';
      assignmentId: string;
      employeeId: string;
      terminationId?: string;
      firmaEmpleado: string;
      firmaEmpleadoEn: Date;
      aceptaPoliticaUso: true;
    };

function assertOfficialEvidence(
  firma: string,
  aceptaPoliticaUso: boolean,
  tipo: 'entrega' | 'devolucion'
) {
  if (!pngSignatureSchema.safeParse(firma).success || !policyAcceptanceSchema.safeParse(aceptaPoliticaUso).success) {
    throw new ServiceConflictError(`La ${tipo} requiere firma PNG y aceptación explícita de política`);
  }
}

function eventTimestamp(context?: ServerEvidenceContext) {
  return context?.eventTimestamp ?? new Date();
}

function employeeName(employee: { nombres?: string; apellidoPaterno?: string; rut?: string | null }) {
  return `${employee.nombres || 'Empleado'} ${employee.apellidoPaterno || ''}`.trim();
}

/**
 * Creates an assignment after atomically claiming the available asset. The
 * asset CAS is intentionally before Assignment.create so concurrent deliveries
 * cannot create two active assignments for the same asset.
 */
export async function executeAssignment(
  tx: PrismaTx,
  params: ExecuteAssignmentParams,
  context?: ServerEvidenceContext
) {
  assertOfficialEvidence(params.firmaEmpleadoEntrega, params.aceptaPoliticaUso, 'entrega');
  const firmaEmpleadoEntregaEn = eventTimestamp(context);
  const asset = await tx.asset.findUnique({
    where: { id: params.assetId },
    include: { categoria: true },
  });
  if (!asset || asset.deletedAt) throw new ServiceNotFoundError('Activo no encontrado');

  const employee = await tx.employee.findUnique({ where: { id: params.employeeId } });
  if (!employee) throw new ServiceNotFoundError('Empleado no encontrado');
  if (employee.estado !== 'activo') throw new ServiceConflictError('El empleado no está activo');

  const claimed = await tx.asset.updateMany({
    where: {
      id: params.assetId,
      deletedAt: null,
      estado: { in: ['disponible', 'reutilizable'] },
    },
    data: { estado: 'asignado', empleadoActualId: params.employeeId },
  });
  if (claimed.count !== 1) {
    throw new ServiceConflictError('El activo cambió antes de asignarlo; actualice e intente nuevamente');
  }

  const assignment = await tx.assignment.create({
    data: {
      assetId: params.assetId,
      employeeId: params.employeeId,
      fechaEntrega: params.fechaEntrega,
      lugarEntrega: params.lugarEntrega,
      entregadoPor: params.entregadoPor,
      tipoMovimiento: params.tipoMovimiento,
      motivo: params.motivo,
      firmaEmpleadoEntrega: params.firmaEmpleadoEntrega,
      firmaEmpleadoEntregaEn,
      activo: true,
    },
    include: { asset: { include: { categoria: true } }, employee: true },
  });

  await tx.assetHistory.create({
    data: {
      assetId: params.assetId,
      tipoEvento: 'asignacion',
      descripcion: `Asignado a ${employeeName(employee)} (${employee.rut || '—'})`,
      datosAnteriores: { estado: asset.estado, empleadoActualId: asset.empleadoActualId },
      datosNuevos: { estado: 'asignado', empleadoActualId: params.employeeId },
      usuarioSistema: params.entregadoPor || 'Sistema',
    },
  });

  return {
    assignment,
    evidenciaParaDocumento: {
      tipo: 'entrega' as const,
      assignmentId: assignment.id,
      employeeId: params.employeeId,
      firmaEmpleado: params.firmaEmpleadoEntrega,
      firmaEmpleadoEn: firmaEmpleadoEntregaEn,
      aceptaPoliticaUso: true as const,
    } satisfies AssignmentEvidenceForDocument,
  };
}

/** Processes a single return with assignment and asset compare-and-set guards. */
export async function executeReturn(
  tx: PrismaTx,
  params: ExecuteReturnParams,
  context?: ServerEvidenceContext
) {
  assertOfficialEvidence(params.firmaEmpleadoDevolucion, params.aceptaPoliticaUso, 'devolucion');
  const firmaEmpleadoDevolucionEn = eventTimestamp(context);
  const assignment = await tx.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { asset: true, employee: true },
  });
  if (!assignment) throw new ServiceNotFoundError('Asignación no encontrada');

  const expectedEmployeeId = context?.expectedEmployeeId ?? assignment.employeeId;
  if (assignment.employeeId !== expectedEmployeeId) {
    throw new ServiceConflictError('La asignación no pertenece al empleado de este acto');
  }
  if (!assignment.activo) throw new ServiceConflictError('La asignación ya no está activa');
  if (
    assignment.asset.deletedAt ||
    assignment.asset.estado !== 'asignado' ||
    assignment.asset.empleadoActualId !== expectedEmployeeId
  ) {
    throw new ServiceConflictError('El activo ya no está vinculado a esta asignación activa');
  }

  const closed = await tx.assignment.updateMany({
    where: {
      id: params.assignmentId,
      activo: true,
      employeeId: expectedEmployeeId,
      assetId: assignment.assetId,
    },
    data: {
      activo: false,
      fechaDevolucion: params.fechaDevolucion,
      recibidoPor: params.recibidoPor,
      estadoDevolucion: params.estadoDevolucion,
      observacionesDevolucion: params.observacionesDevolucion,
      firmaEmpleadoDevolucion: params.firmaEmpleadoDevolucion,
      firmaEmpleadoDevolucionEn,
    },
  });
  if (closed.count !== 1) throw new ServiceConflictError('La asignación cambió antes de devolverla; actualice e intente nuevamente');

  const nuevoEstado = params.estadoDevolucion === 'danado' ? 'baja' : 'reutilizable';
  const released = await tx.asset.updateMany({
    where: {
      id: assignment.assetId,
      deletedAt: null,
      estado: 'asignado',
      empleadoActualId: expectedEmployeeId,
    },
    data: {
      estado: nuevoEstado,
      condicion: params.estadoDevolucion === 'danado' ? 'danado' : 'usado',
      empleadoActualId: null,
      ...(nuevoEstado === 'baja' && { fechaBaja: firmaEmpleadoDevolucionEn }),
    },
  });
  if (released.count !== 1) throw new ServiceConflictError('El activo cambió antes de devolverlo; actualice e intente nuevamente');

  await tx.assetHistory.create({
    data: {
      assetId: assignment.assetId,
      tipoEvento: 'devolucion',
      descripcion: `Devuelto por ${employeeName(assignment.employee)}. Estado: ${params.estadoDevolucion}`,
      datosAnteriores: { estado: assignment.asset.estado, empleadoActualId: assignment.asset.empleadoActualId },
      datosNuevos: { estado: nuevoEstado, empleadoActualId: null },
      usuarioSistema: params.recibidoPor || 'Sistema',
    },
  });

  return {
    assignment: {
      ...assignment,
      activo: false,
      fechaDevolucion: params.fechaDevolucion,
      firmaEmpleadoDevolucion: params.firmaEmpleadoDevolucion,
      firmaEmpleadoDevolucionEn,
    },
    evidenciaParaDocumento: {
      tipo: 'devolucion' as const,
      assignmentId: assignment.id,
      employeeId: expectedEmployeeId,
      ...(context?.terminationId && { terminationId: context.terminationId }),
      firmaEmpleado: params.firmaEmpleadoDevolucion,
      firmaEmpleadoEn: firmaEmpleadoDevolucionEn,
      aceptaPoliticaUso: true as const,
    } satisfies AssignmentEvidenceForDocument,
  };
}

type TerminationAssetType = 'notebook' | 'celular' | 'monitor';

/**
 * Las tres categorías que el formulario de cierre pregunta una por una. Todo
 * activo asignado cae en `TipoDevolucion`, así que cualquier otro valor —hoy
 * `otro`— describe un equipo cuyo estado nadie declara.
 */
const EVALUATED_CATEGORIES: readonly TerminationAssetType[] = ['notebook', 'celular', 'monitor'];

function assertTerminationCategoryStates(
  assignments: Array<{ asset: { categoria: { nombre?: string; tipoDevolucion: string } } }>,
  params: ExecuteTerminationReturnParams,
  kitsEntregados: number
) {
  if (params.estadoKit === 'pendiente') {
    throw new ServiceConflictError('No se puede cerrar una devolución con estado pendiente');
  }
  const states: Array<[TerminationAssetType, ExecuteTerminationReturnParams['estadoNotebook']]> = [
    ['notebook', params.estadoNotebook],
    ['celular', params.estadoCelular],
    ['monitor', params.estadoMonitor],
  ];

  // El kit no vive en `Asset` sino en `KitAssignment`, así que su contraste es
  // contra lo que ese registro dice que el empleado tiene, no contra las
  // categorías de activos.
  // `pendiente` ya quedó descartado arriba para cualquier estado del kit.
  if (kitsEntregados > 0 && params.estadoKit === 'no_aplica') {
    throw new ServiceConflictError(
      `No se puede cerrar: el empleado tiene ${kitsEntregados} ítem(s) de kit entregados y el estado declarado es no_aplica`
    );
  }
  if (kitsEntregados === 0 && params.estadoKit !== 'no_aplica') {
    throw new ServiceConflictError('El empleado no tiene kit entregado: el estado del kit debe ser no_aplica');
  }

  // Un acta no puede afirmar el estado de algo que nadie evaluó.
  const sinEvaluar = assignments.find(
    (assignment) => !EVALUATED_CATEGORIES.includes(assignment.asset.categoria.tipoDevolucion as TerminationAssetType)
  );
  if (sinEvaluar) {
    throw new ServiceConflictError(
      `No se puede cerrar: hay un activo de categoría "${sinEvaluar.asset.categoria.nombre ?? sinEvaluar.asset.categoria.tipoDevolucion}" cuyo estado este cierre no evalúa. Devuélvalo con su propia acta antes de consolidar.`
    );
  }

  for (const [category, state] of states) {
    const hasActiveAsset = assignments.some((assignment) => assignment.asset.categoria.tipoDevolucion === category);
    if (hasActiveAsset && (state === 'pendiente' || state === 'no_aplica')) {
      throw new ServiceConflictError(`No se puede cerrar: existe ${category} activo con estado ${state}`);
    }
    if (!hasActiveAsset && state !== 'no_aplica') {
      throw new ServiceConflictError(`No existe ${category} activo: debe indicar no_aplica`);
    }
  }
}

/** Processes all active assignments of one employee during termination. */
export async function executeTerminationReturn(
  tx: PrismaTx,
  params: ExecuteTerminationReturnParams,
  context?: ServerEvidenceContext
) {
  assertOfficialEvidence(params.firmaEmpleadoDevolucion, params.aceptaPoliticaUso, 'devolucion');
  const returnTimestamp = eventTimestamp(context);
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
  if (!termination) throw new ServiceNotFoundError('Desvinculación no encontrada');

  const expectedEmployeeId = context?.expectedEmployeeId ?? termination.employeeId;
  if (termination.employeeId !== expectedEmployeeId) {
    throw new ServiceConflictError('La desvinculación no pertenece al empleado de este acto');
  }
  const assignments = termination.employee.assignments;
  const kitsEntregados = await tx.kitAssignment.count({
    where: { employeeId: expectedEmployeeId, estado: 'entregado' },
  });
  assertTerminationCategoryStates(assignments, params, kitsEntregados);
  for (const assignment of assignments) {
    if (
      assignment.employeeId !== expectedEmployeeId ||
      !assignment.activo ||
      assignment.asset.deletedAt ||
      assignment.asset.estado !== 'asignado' ||
      assignment.asset.empleadoActualId !== expectedEmployeeId
    ) {
      throw new ServiceConflictError('Una asignación de la desvinculación ya no está vinculada al empleado');
    }
  }

  const hayDanos = [
    params.estadoNotebook,
    params.estadoCelular,
    params.estadoMonitor,
    params.estadoKit,
  ].includes('danado');
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

  // El kit declarado deja de estar entregado. Sin esto la validación de arriba
  // seguiría viendo el kit como pendiente de devolver para siempre.
  if (kitsEntregados > 0) {
    await tx.kitAssignment.updateMany({
      where: { employeeId: expectedEmployeeId, estado: 'entregado' },
      data: { estado: 'devuelto' },
    });
  }

  const results = [];
  for (const assignment of assignments) {
    const type = assignment.asset.categoria.tipoDevolucion;
    const categoryState = type === 'notebook'
      ? params.estadoNotebook
      : type === 'celular'
        ? params.estadoCelular
        : type === 'monitor'
          ? params.estadoMonitor
          : 'ok';
    const result = await executeReturn(tx, {
      assignmentId: assignment.id,
      fechaDevolucion: params.fechaDevolucionEquipos,
      recibidoPor: params.recibidoPor,
      estadoDevolucion: categoryState === 'danado' ? 'danado' : 'ok',
      observacionesDevolucion: `Devolución por desvinculación. ${params.observaciones || ''}`.trim(),
      firmaEmpleadoDevolucion: params.firmaEmpleadoDevolucion,
      aceptaPoliticaUso: true,
    }, {
      eventTimestamp: returnTimestamp,
      expectedEmployeeId,
      terminationId: termination.id,
    });
    results.push(result);
  }

  return {
    termination: updatedTermination,
    evidenciasParaDocumento: results.map((result) => result.evidenciaParaDocumento),
  };
}
