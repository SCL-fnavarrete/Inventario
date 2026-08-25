import type { Prisma } from '@prisma/client';
import { ServiceNotFoundError } from '@/lib/errors/serviceOperationError';
import type { ActivoDevueltoSnapshot, ActivoSnapshot } from '@/lib/documents/snapshot';
import type { DatosSnapshot } from '@/lib/services/documentEmissionService';

type PrismaTx = Prisma.TransactionClient;

/**
 * Arma el contenido de un documento desde la transaccion que lo origina.
 *
 * Los generadores viejos resolvian los activos con
 * `employee.assignments where activo = true`: el anexo de una entrega de marzo
 * mostraba lo que la persona tuviera el dia de la descarga, y una devolucion
 * posterior lo vaciaba. Aqui las asignaciones se piden por id —exactamente las
 * que participaron en el acto— y su categoria se congela con el nombre
 * observado mas el `tipoDevolucion` estable de la Ola 2.
 */

export type FirmaDelActo = {
  imagenPng: string | null;
  firmadaEn: Date | null;
};

export type SolicitudDelActo = { id: string; numero: string; tipo: string } | null;

type AsignacionConActivo = {
  id: string;
  estadoDevolucion: string | null;
  asset: {
    id: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    condicion: string;
    procesador: string | null;
    ram: string | null;
    discoDuro: string | null;
    sistemaOperativo: string | null;
    imei: string | null;
    numeroTelefono: string | null;
    operador: string | null;
    categoria: { nombre: string; tipoDevolucion: string };
  };
};

const INCLUDE_ACTIVO = { asset: { include: { categoria: true } } } as const;

function aActivoSnapshot(asignacion: AsignacionConActivo): ActivoSnapshot {
  const { asset } = asignacion;
  return {
    assignmentId: asignacion.id,
    assetId: asset.id,
    categoriaNombre: asset.categoria.nombre,
    tipoDevolucion: asset.categoria.tipoDevolucion as ActivoSnapshot['tipoDevolucion'],
    marca: asset.marca,
    modelo: asset.modelo,
    numeroSerie: asset.numeroSerie,
    condicion: asset.condicion,
    procesador: asset.procesador,
    ram: asset.ram,
    discoDuro: asset.discoDuro,
    sistemaOperativo: asset.sistemaOperativo,
    imei: asset.imei,
    numeroTelefono: asset.numeroTelefono,
    operador: asset.operador,
  };
}

/**
 * Devuelve los activos en el orden en que se pidieron.
 *
 * El orden importa: es el del documento, y `findMany` no lo garantiza.
 */
async function activosDe(tx: PrismaTx, assignmentIds: string[]): Promise<AsignacionConActivo[]> {
  if (assignmentIds.length === 0) return [];
  const asignaciones = (await tx.assignment.findMany({
    where: { id: { in: assignmentIds } },
    include: INCLUDE_ACTIVO,
  })) as unknown as AsignacionConActivo[];

  const porId = new Map(asignaciones.map((asignacion) => [asignacion.id, asignacion]));
  return assignmentIds
    .map((id) => porId.get(id))
    .filter((asignacion): asignacion is AsignacionConActivo => Boolean(asignacion));
}

async function empleadoDe(tx: PrismaTx, employeeId: string, cargoSolicitado?: string | null) {
  const empleado = await tx.employee.findUnique({ where: { id: employeeId } });
  if (!empleado) throw new ServiceNotFoundError('Empleado no encontrado para emitir el documento');

  const apellidos = [empleado.apellidoPaterno, empleado.apellidoMaterno].filter(Boolean).join(' ');
  return {
    id: empleado.id,
    nombreCompleto: `${empleado.nombres} ${apellidos}`.trim(),
    rut: empleado.rut,
    correo: empleado.correo,
    // El cargo del acto es el que la solicitud declaro; el maestro puede haber
    // cambiado despues, y el documento tiene que decir lo que decia entonces.
    cargo: cargoSolicitado || empleado.cargo,
    fechaIngreso: empleado.fechaIngreso ? empleado.fechaIngreso.toISOString() : null,
  };
}

function firmaSnapshot(firma: FirmaDelActo) {
  return {
    imagenPng: firma.imagenPng,
    firmadaEn: firma.firmadaEn ? firma.firmadaEn.toISOString() : null,
  };
}

/**
 * La firma del acto es la que quedo en `Assignment`; el snapshot la sella.
 *
 * Vive aqui y no en una ruta porque la usan los dos caminos que emiten un acta
 * de devolucion: la transicion de la solicitud y la desvinculacion directa.
 */
export function firmaDeEvidencias(
  evidencias: Array<{ firmaEmpleado: string | null; firmaEmpleadoEn: Date | null }>
): FirmaDelActo {
  const evidencia = evidencias[0];
  return evidencia
    ? { imagenPng: evidencia.firmaEmpleado, firmadaEn: evidencia.firmaEmpleadoEn }
    : { imagenPng: null, firmadaEn: null };
}

type BaseActo = {
  employeeId: string;
  solicitud: SolicitudDelActo;
  firma: FirmaDelActo;
};

export async function datosDeEntrega(
  tx: PrismaTx,
  params: BaseActo & {
    assignmentIds: string[];
    gestionadoPor: string;
    fechaEntrega: Date;
    lugarEntrega: string | null;
    cargoSolicitado: string | null;
  }
): Promise<{
  anexo: Extract<DatosSnapshot, { tipo: 'anexo_entrega' }>;
  comprobante: Extract<DatosSnapshot, { tipo: 'comprobante_entrega' }>;
}> {
  const empleado = await empleadoDe(tx, params.employeeId, params.cargoSolicitado);
  const activos = (await activosDe(tx, params.assignmentIds)).map(aActivoSnapshot);
  const comun = {
    empleado,
    solicitud: params.solicitud,
    aceptaPoliticaUso: true as const,
    firma: firmaSnapshot(params.firma),
    gestionadoPor: params.gestionadoPor,
    fechaEntrega: params.fechaEntrega.toISOString(),
    activos,
  };

  return {
    anexo: { ...comun, tipo: 'anexo_entrega', lugarEntrega: params.lugarEntrega },
    comprobante: { ...comun, tipo: 'comprobante_entrega' },
  };
}

export async function datosDeCambio(
  tx: PrismaTx,
  params: BaseActo & {
    gestionadoPor: string;
    fecha: Date;
    motivoCambio: string;
    assignmentAnteriorId: string | null;
    assignmentNuevoId: string | null;
  }
): Promise<Extract<DatosSnapshot, { tipo: 'comprobante_cambio' }>> {
  const empleado = await empleadoDe(tx, params.employeeId);
  const ids = [params.assignmentAnteriorId, params.assignmentNuevoId].filter((id): id is string =>
    Boolean(id)
  );
  const porId = new Map(
    (await activosDe(tx, ids)).map((asignacion) => [
      asignacion.id,
      {
        ...aActivoSnapshot(asignacion),
        // El comprobante afirma con qué estado volvió el equipo, así que el dato
        // tiene que estar en el snapshot y no en un literal de la plantilla.
        estadoDevolucion: asignacion.estadoDevolucion,
      },
    ])
  );

  return {
    tipo: 'comprobante_cambio',
    empleado,
    solicitud: params.solicitud,
    aceptaPoliticaUso: true,
    firma: firmaSnapshot(params.firma),
    gestionadoPor: params.gestionadoPor,
    fecha: params.fecha.toISOString(),
    motivoCambio: params.motivoCambio,
    equipoAnterior: params.assignmentAnteriorId
      ? (porId.get(params.assignmentAnteriorId) ?? null)
      : null,
    equipoNuevo: params.assignmentNuevoId ? (porId.get(params.assignmentNuevoId) ?? null) : null,
  };
}

export async function datosDeDevolucion(
  tx: PrismaTx,
  params: BaseActo & {
    assignmentIds: string[];
    recibidoPor: string;
    fechaDevolucion: Date;
    fechaTermino: Date | null;
    lugarDevolucion: string | null;
    observaciones: string | null;
  }
): Promise<Extract<DatosSnapshot, { tipo: 'acta_devolucion' }>> {
  const empleado = await empleadoDe(tx, params.employeeId);
  const asignaciones = await activosDe(tx, params.assignmentIds);

  if (asignaciones.some((asignacion) => asignacion.estadoDevolucion === null)) {
    throw new Error('No se puede construir el acta sin estado de devolución declarado');
  }

  const activos: ActivoDevueltoSnapshot[] = asignaciones.map((asignacion) => ({
    ...aActivoSnapshot(asignacion),
    estadoDevolucion: asignacion.estadoDevolucion!,
  }));

  return {
    tipo: 'acta_devolucion',
    empleado,
    solicitud: params.solicitud,
    aceptaPoliticaUso: true,
    firma: firmaSnapshot(params.firma),
    recibidoPor: params.recibidoPor,
    fechaInicio: empleado.fechaIngreso,
    fechaTermino: params.fechaTermino ? params.fechaTermino.toISOString() : null,
    fechaDevolucion: params.fechaDevolucion.toISOString(),
    lugarDevolucion: params.lugarDevolucion,
    observaciones: params.observaciones,
    activos,
  };
}
