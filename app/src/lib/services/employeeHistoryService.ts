import { Employee, Prisma, TipoEventoEmpleado } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type PrismaTx = Prisma.TransactionClient;

type EmployeeHistorySnapshotSource = Pick<
  Employee,
  | 'id'
  | 'rut'
  | 'nombres'
  | 'apellidoPaterno'
  | 'apellidoMaterno'
  | 'correo'
  | 'cargo'
  | 'jefatura'
  | 'supervisor'
  | 'ubicacion'
  | 'tipoContrato'
  | 'fechaIngreso'
  | 'fechaTermino'
  | 'estado'
  | 'telefonoContacto'
  | 'origenMicrosoft'
  | 'fechaEntregaEpp'
  | 'fechaEntregaKit'
  | 'proximaMantencionEpp'
>;

export type EmployeeHistoryData = {
  employeeId: string;
  tipoEvento: TipoEventoEmpleado;
  descripcion: string;
  datosAnteriores?: Prisma.InputJsonValue;
  datosNuevos?: Prisma.InputJsonValue;
  usuarioSistema: string;
};

type OrigenCambio = 'manual' | 'microsoft';

const SNAPSHOT_KEYS = [
  'id',
  'rut',
  'nombres',
  'apellidoPaterno',
  'apellidoMaterno',
  'correo',
  'cargo',
  'jefatura',
  'supervisor',
  'ubicacion',
  'tipoContrato',
  'fechaIngreso',
  'fechaTermino',
  'estado',
  'telefonoContacto',
  'origenMicrosoft',
  'fechaEntregaEpp',
  'fechaEntregaKit',
  'proximaMantencionEpp',
] as const;

function dateToIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function nombreEmpleado(
  employee: Pick<EmployeeHistorySnapshotSource, 'nombres' | 'apellidoPaterno'>
) {
  return `${employee.nombres} ${employee.apellidoPaterno}`.trim();
}

function actorRequerido(actor: string): string {
  const actorNormalizado = actor.trim();
  if (!actorNormalizado) {
    throw new Error('El actor del historial de empleados es obligatorio');
  }
  return actorNormalizado;
}

/**
 * Convierte un empleado a un snapshot explícitamente permitido. Nunca se
 * persiste ni expone microsoftId, ni campos que el modelo pueda agregar en el
 * futuro sin una revisión de seguridad de este allowlist.
 */
export function crearSnapshotEmpleado(
  employee: EmployeeHistorySnapshotSource
): Prisma.InputJsonObject {
  return {
    id: employee.id,
    rut: employee.rut,
    nombres: employee.nombres,
    apellidoPaterno: employee.apellidoPaterno,
    apellidoMaterno: employee.apellidoMaterno,
    correo: employee.correo,
    cargo: employee.cargo,
    jefatura: employee.jefatura,
    supervisor: employee.supervisor,
    ubicacion: employee.ubicacion,
    tipoContrato: employee.tipoContrato,
    fechaIngreso: dateToIso(employee.fechaIngreso),
    fechaTermino: dateToIso(employee.fechaTermino),
    estado: employee.estado,
    telefonoContacto: employee.telefonoContacto,
    origenMicrosoft: employee.origenMicrosoft,
    fechaEntregaEpp: dateToIso(employee.fechaEntregaEpp),
    fechaEntregaKit: dateToIso(employee.fechaEntregaKit),
    proximaMantencionEpp: dateToIso(employee.proximaMantencionEpp),
  };
}

/** Permite defender la ficha incluso frente a snapshots históricos ajenos. */
export function sanitizarSnapshotEmpleado(snapshot: unknown): Prisma.InputJsonObject | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;

  const record = snapshot as Record<string, unknown>;
  const seguro: Record<string, unknown> = {};

  for (const key of SNAPSHOT_KEYS) {
    const value = record[key];
    if (
      value === null ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
    ) {
      seguro[key] = value;
    }
  }

  return seguro as Prisma.InputJsonObject;
}

export function huboCambiosEmpleado(
  anterior: EmployeeHistorySnapshotSource,
  nuevo: EmployeeHistorySnapshotSource
): boolean {
  return (
    JSON.stringify(crearSnapshotEmpleado(anterior)) !== JSON.stringify(crearSnapshotEmpleado(nuevo))
  );
}

function tipoEventoPorEstado(
  estadoAnterior: EmployeeHistorySnapshotSource['estado'],
  estadoNuevo: EmployeeHistorySnapshotSource['estado']
): TipoEventoEmpleado {
  if (estadoNuevo === 'desvinculado') return 'desvinculacion';
  if (estadoAnterior === 'desvinculado' && estadoNuevo === 'activo') return 'reactivacion';
  return 'cambio_estado';
}

/**
 * Historial inmutable del maestro de empleados. El `tx` es obligatorio para
 * que cada hecho operativo y su evidencia se confirmen o reviertan juntos.
 */
export const employeeHistoryService = {
  async registrar(data: EmployeeHistoryData, tx: PrismaTx) {
    return tx.employeeHistory.create({
      data: {
        employeeId: data.employeeId,
        tipoEvento: data.tipoEvento,
        descripcion: data.descripcion,
        datosAnteriores: data.datosAnteriores,
        datosNuevos: data.datosNuevos,
        usuarioSistema: actorRequerido(data.usuarioSistema),
      },
    });
  },

  async registrarCreacion(employee: EmployeeHistorySnapshotSource, actor: string, tx: PrismaTx) {
    return this.registrar(
      {
        employeeId: employee.id,
        tipoEvento: 'creacion',
        descripcion: `Empleado creado: ${nombreEmpleado(employee)}`,
        datosNuevos: crearSnapshotEmpleado(employee),
        usuarioSistema: actor,
      },
      tx
    );
  },

  async registrarActualizacion(
    anterior: EmployeeHistorySnapshotSource,
    nuevo: EmployeeHistorySnapshotSource,
    actor: string,
    tx: PrismaTx
  ) {
    return this.registrar(
      {
        employeeId: nuevo.id,
        tipoEvento: 'actualizacion',
        descripcion: `Datos actualizados de ${nombreEmpleado(nuevo)}`,
        datosAnteriores: crearSnapshotEmpleado(anterior),
        datosNuevos: crearSnapshotEmpleado(nuevo),
        usuarioSistema: actor,
      },
      tx
    );
  },

  async registrarSincronizacionMicrosoft(
    anterior: EmployeeHistorySnapshotSource,
    nuevo: EmployeeHistorySnapshotSource,
    actor: string,
    tx: PrismaTx
  ) {
    return this.registrar(
      {
        employeeId: nuevo.id,
        tipoEvento: 'sync_microsoft',
        descripcion: `Datos sincronizados desde Microsoft para ${nombreEmpleado(nuevo)}`,
        datosAnteriores: crearSnapshotEmpleado(anterior),
        datosNuevos: crearSnapshotEmpleado(nuevo),
        usuarioSistema: actor,
      },
      tx
    );
  },

  async registrarCambioEstado(
    anterior: EmployeeHistorySnapshotSource,
    nuevo: EmployeeHistorySnapshotSource,
    actor: string,
    tx: PrismaTx
  ) {
    const tipoEvento = tipoEventoPorEstado(anterior.estado, nuevo.estado);
    const descripcionPorEvento: Record<TipoEventoEmpleado, string> = {
      creacion: `Empleado creado: ${nombreEmpleado(nuevo)}`,
      actualizacion: `Datos actualizados de ${nombreEmpleado(nuevo)}`,
      sync_microsoft: `Datos sincronizados desde Microsoft para ${nombreEmpleado(nuevo)}`,
      cambio_estado: `Estado cambiado de "${anterior.estado}" a "${nuevo.estado}"`,
      desvinculacion: `Empleado desvinculado: ${nombreEmpleado(nuevo)}`,
      reactivacion: `Empleado reactivado: ${nombreEmpleado(nuevo)}`,
    };

    return this.registrar(
      {
        employeeId: nuevo.id,
        tipoEvento,
        descripcion: descripcionPorEvento[tipoEvento],
        datosAnteriores: crearSnapshotEmpleado(anterior),
        datosNuevos: crearSnapshotEmpleado(nuevo),
        usuarioSistema: actor,
      },
      tx
    );
  },

  async registrarCambio(
    anterior: EmployeeHistorySnapshotSource,
    nuevo: EmployeeHistorySnapshotSource,
    actor: string,
    tx: PrismaTx,
    origen: OrigenCambio = 'manual'
  ) {
    if (!huboCambiosEmpleado(anterior, nuevo)) return null;

    if (anterior.estado !== nuevo.estado) {
      return this.registrarCambioEstado(anterior, nuevo, actor, tx);
    }

    if (origen === 'microsoft') {
      return this.registrarSincronizacionMicrosoft(anterior, nuevo, actor, tx);
    }

    return this.registrarActualizacion(anterior, nuevo, actor, tx);
  },

  async obtenerHistorial(employeeId: string) {
    return prisma.employeeHistory.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  },
};
