import { Prisma } from '@prisma/client';
import {
  OfficialDeliveryEvidence,
  OfficialReturnEvidence,
  pngSignatureSchema,
  policyAcceptanceSchema,
} from '@/lib/validations/signature';

type PrismaTx = Prisma.TransactionClient;

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
      firmaEmpleado: string;
      firmaEmpleadoEn: Date;
      aceptaPoliticaUso: true;
    }
  | {
      tipo: 'devolucion';
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
    throw new Error(`La ${tipo} requiere firma PNG y aceptación explícita de política`);
  }
}

/**
 * Creates an assignment and updates the asset state. Reusable from both
 * the direct POST /api/asignaciones route and the workflow transition endpoint.
 */
export async function executeAssignment(
  tx: PrismaTx,
  params: ExecuteAssignmentParams
) {
  assertOfficialEvidence(params.firmaEmpleadoEntrega, params.aceptaPoliticaUso, 'entrega');
  const firmaEmpleadoEntregaEn = new Date();
  const asset = await tx.asset.findUnique({
    where: { id: params.assetId },
    include: { categoria: true },
  });

  if (!asset || asset.deletedAt) throw new Error('Activo no encontrado');
  if (asset.estado !== 'disponible' && asset.estado !== 'reutilizable') {
    throw new Error(`El activo no está disponible. Estado actual: ${asset.estado}`);
  }

  const employee = await tx.employee.findUnique({
    where: { id: params.employeeId },
  });

  if (!employee) throw new Error('Empleado no encontrado');
  if (employee.estado !== 'activo') throw new Error('El empleado no está activo');

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

  return {
    ...assignment,
    evidenciaParaDocumento: {
      tipo: 'entrega' as const,
      firmaEmpleado: params.firmaEmpleadoEntrega,
      firmaEmpleadoEn: firmaEmpleadoEntregaEn,
      aceptaPoliticaUso: true as const,
    } satisfies AssignmentEvidenceForDocument,
  };
}

/**
 * Processes a single assignment return.
 */
export async function executeReturn(tx: PrismaTx, params: ExecuteReturnParams) {
  assertOfficialEvidence(params.firmaEmpleadoDevolucion, params.aceptaPoliticaUso, 'devolucion');
  const firmaEmpleadoDevolucionEn = new Date();
  const assignment = await tx.assignment.findUnique({
    where: { id: params.assignmentId },
    include: { asset: true, employee: true },
  });

  if (!assignment) throw new Error('Asignación no encontrada');

  const returnedAssignment = await tx.assignment.update({
    where: { id: params.assignmentId },
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

  let nuevoEstado: 'reutilizable' | 'baja' = 'reutilizable';
  if (params.estadoDevolucion === 'danado') nuevoEstado = 'baja';

  await tx.asset.update({
    where: { id: assignment.assetId },
    data: {
      estado: nuevoEstado,
      condicion: params.estadoDevolucion === 'danado' ? 'danado' : 'usado',
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
      datosNuevos: { estado: nuevoEstado, empleadoActualId: null },
      usuarioSistema: params.recibidoPor || 'Sistema',
    },
  });

  return {
    ...returnedAssignment,
    evidenciaParaDocumento: {
      tipo: 'devolucion' as const,
      firmaEmpleado: params.firmaEmpleadoDevolucion,
      firmaEmpleadoEn: firmaEmpleadoDevolucionEn,
      aceptaPoliticaUso: true as const,
    } satisfies AssignmentEvidenceForDocument,
  };
}

/**
 * Processes a full termination return (all equipment for a terminated employee).
 */
export async function executeTerminationReturn(
  tx: PrismaTx,
  params: ExecuteTerminationReturnParams
) {
  assertOfficialEvidence(params.firmaEmpleadoDevolucion, params.aceptaPoliticaUso, 'devolucion');
  const firmaEmpleadoDevolucionEn = new Date();
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

  if (!termination) throw new Error('Desvinculación no encontrada');

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
    const tipoDevolucion = assignment.asset.categoria.tipoDevolucion;
    let estadoDevolucion: 'ok' | 'danado' | 'incompleto' = 'ok';

    if (tipoDevolucion === 'notebook') {
      estadoDevolucion = params.estadoNotebook === 'danado' ? 'danado' : 'ok';
    } else if (tipoDevolucion === 'celular') {
      estadoDevolucion = params.estadoCelular === 'danado' ? 'danado' : 'ok';
    } else if (tipoDevolucion === 'monitor') {
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
        firmaEmpleadoDevolucion: params.firmaEmpleadoDevolucion,
        firmaEmpleadoDevolucionEn,
      },
    });

    let nuevoEstadoActivo: 'disponible' | 'reutilizable' | 'baja' = 'reutilizable';
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

  return {
    ...updatedTermination,
    evidenciaParaDocumento: {
      tipo: 'devolucion' as const,
      firmaEmpleado: params.firmaEmpleadoDevolucion,
      firmaEmpleadoEn: firmaEmpleadoDevolucionEn,
      aceptaPoliticaUso: true as const,
    } satisfies AssignmentEvidenceForDocument,
  };
}
