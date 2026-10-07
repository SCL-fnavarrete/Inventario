import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, NotFoundError, errorDeCampo, errorRepetido } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { estadoPorClave } from '@/modules/lineas/catalogos';
import { whereFiltrosLineas } from '@/modules/lineas/consultas';
import type { FiltrosLineas } from '@/modules/lineas/filtros';
import { CON_NOMBRES, historialLinea, registrarEliminacion, registrarHistorial, type LineaConNombres } from '@/modules/lineas/historial';
import {
  abrirTenencia,
  bloquearLinea,
  cambiarTenencia,
  destinoDeReasignacion,
  exigirCambio,
  exigirCelularDisponible,
  exigirLineaDisponible,
  exigirMotivo,
  exigirSede,
  fechaDeCambio,
  tenenciasDeLinea,
} from '@/modules/lineas/tenencia';
import { errorDeAsociacion, type DatosLinea, type DatosReasignacion, type DestinoLinea } from '@/modules/lineas/validaciones';

/**
 * Lineas telefonicas (SPEC 2.131). Cada linea es un registro propio que se
 * asocia a un celular; la persona es quien tiene ese celular. Sin celular
 * (chip o eSIM en un telefono personal), la persona se guarda en la linea.
 * Estado, plan y tipo de chip son catalogos; cada cambio queda en el
 * historial de la linea y en la auditoria. Donde esta y con quien (telefono,
 * persona) se fija al crearla y solo cambia con `reasignarLinea` o cuando su
 * telefono cambia de manos (tenencia.ts), y cada tramo queda anotado.
 */

// Con su estado: una linea de una persona desvinculada se marca para revisar.
const PERSONA = { select: { id: true, nombres: true, apellidoPaterno: true, rut: true, estado: true } } as const;

const CON_ASOCIADOS = {
  activo: { select: { id: true, marca: true, modelo: true, imei: true, empleadoActual: PERSONA } },
  empleado: PERSONA,
  tipoChip: { select: { id: true, nombre: true, sinCelular: true } },
  operador: { select: { id: true, nombre: true } },
  plan: { select: { id: true, nombre: true } },
  sede: { select: { id: true, nombre: true } },
  estado: { select: { id: true, nombre: true, deBaja: true, clave: true } },
} satisfies Prisma.LineaTelefonicaInclude;

/** Lineas con los filtros de la pantalla (SPEC 2.131: estado, catalogos, asignacion, sede y texto), por numero. */
export async function listarLineas(filtros: FiltrosLineas = {}) {
  return prisma.lineaTelefonica.findMany({
    where: whereFiltrosLineas(filtros),
    include: CON_ASOCIADOS,
    orderBy: { numero: 'asc' },
  });
}

/** Una opcion de catalogo elegida tiene que existir y estar activa, salvo que la linea ya la tuviera. */
async function exigirOpcion(
  campo: 'planId' | 'estadoId' | 'tipoChipId' | 'operadorId',
  id: string | null | undefined,
  actual: string | null | undefined,
  buscar: (id: string) => Promise<{ activo: boolean } | null>
) {
  if (!id || id === actual) return;
  if (!(await buscar(id))?.activo) throw errorDeCampo(campo, 'Elige una opción de la lista');
}

const tipoChip = (id: string | null | undefined) =>
  id ? prisma.tipoChip.findUnique({ where: { id }, select: { sinCelular: true } }) : Promise.resolve(null);

/** Donde esta asociada la linea hoy. */
const destinoActual = (l: { activoId: string | null; empleadoId: string | null }): DestinoLinea =>
  l.activoId ? 'telefono' : l.empleadoId ? 'persona' : 'ninguno';

/**
 * Cambiar el tipo de chip al editar: no se quita, y el nuevo tiene que calzar con
 * donde esta la linea (una en un celular no pasa a eSIM, una con una persona no
 * pasa a chip fisico). Si no calza, primero se deja sin asignar con Reasignar.
 */
async function exigirChipCompatible(nuevo: string | null | undefined, actual: LineaConNombres) {
  if ((nuevo || null) === actual.tipoChipId) return;
  if (!nuevo) throw errorDeCampo('tipoChipId', 'Elige el tipo de chip');
  if (errorDeAsociacion(await tipoChip(nuevo), destinoActual(actual))) {
    const donde = actual.activoId ? 'en un celular de la empresa' : 'con una persona';
    throw errorDeCampo('tipoChipId', `La línea está ${donde}: déjala sin asignar con Reasignar y después cambia el tipo de chip`);
  }
}

/** El celular tiene que existir y ser de una categoria de celulares; la persona, existir. */
async function validarAsociados(datos: DatosLinea, actual?: LineaConNombres) {
  await exigirOpcion('planId', datos.planId, actual?.planId, (id) => prisma.planLinea.findUnique({ where: { id } }));
  await exigirOpcion('estadoId', datos.estadoId, actual?.estadoId, (id) => prisma.estadoLinea.findUnique({ where: { id } }));
  await exigirOpcion('tipoChipId', datos.tipoChipId, actual?.tipoChipId, (id) => prisma.tipoChip.findUnique({ where: { id } }));
  await exigirOpcion('operadorId', datos.operadorId, actual?.operadorId, (id) => prisma.operadorLinea.findUnique({ where: { id } }));
  await exigirSede(prisma, datos.sedeId, actual?.sedeId ?? null);
  // Chip fisico -> celular de la empresa; eSIM -> persona. Solo al crear: las que ya existen no se tocan.
  if (!actual && (datos.activoId || datos.empleadoId)) {
    const destino = datos.activoId ? 'telefono' : 'persona';
    const error = errorDeAsociacion(await tipoChip(datos.tipoChipId), destino);
    if (error) throw errorDeCampo(datos.activoId ? 'activoId' : 'empleadoId', error);
  }
  // Al crear: un celular sin persona (la recibe con una solicitud) o, una eSIM, una persona activa (SPEC 2.131).
  if (!actual && datos.activoId) await exigirCelularDisponible(prisma, datos.activoId);
  if (!actual && datos.empleadoId && !datos.activoId) {
    const persona = await prisma.employee.findUnique({ where: { id: datos.empleadoId }, select: { estado: true } });
    if (!persona) throw errorDeCampo('empleadoId', 'La persona no existe');
    if (persona.estado === 'desvinculado') throw errorDeCampo('empleadoId', 'La persona está desvinculada');
  }
}

/** La linea bloqueada hasta el fin de la transaccion, leida despues del bloqueo (asi esta al dia). */
async function lineaBloqueada(tx: Prisma.TransactionClient, id: string) {
  await bloquearLinea(tx, id);
  const linea = await tx.lineaTelefonica.findUnique({ where: { id }, include: CON_NOMBRES });
  if (!linea) throw new NotFoundError('Línea no encontrada');
  return linea;
}

async function exigirNumeroLibre(numero: string, id?: string) {
  const otra = await prisma.lineaTelefonica.findFirst({ where: { numero, NOT: id ? { id } : undefined } });
  if (otra) throw errorRepetido('numero', 'Ya existe una línea con ese número');
}

/** Fecha desde la que rige un cambio: la indicada o hoy. No puede ser futura. */
const fechaVigencia = (texto: string | null | undefined) => fechaDeCambio(texto);

/**
 * Lo que se guarda. Con celular, la persona es la del celular. La fecha de
 * baja se pone al pasar a un estado de baja (la de vigencia) y se quita al
 * volver a uno que no lo es.
 */
async function aGuardar(datos: DatosLinea & { responsable?: string | null }, vigenteDesde: Date, actual?: LineaConNombres) {
  const estado = datos.estadoId
    ? await prisma.estadoLinea.findUniqueOrThrow({ where: { id: datos.estadoId } })
    : actual
      ? { id: actual.estadoId, deBaja: actual.estado.deBaja }
      : await estadoPorClave(prisma, 'activa');
  const sigueDeBaja = !!actual?.estado.deBaja && estado.deBaja;
  return {
    numero: datos.numero,
    planId: datos.planId || null,
    precioMensual: datos.precioMensual ?? null,
    estadoId: estado.id,
    fechaBaja: estado.deBaja ? (sigueDeBaja ? actual!.fechaBaja : vigenteDesde) : null,
    tipoChipId: datos.tipoChipId || null,
    operadorId: datos.operadorId || null,
    activoId: datos.activoId || null,
    empleadoId: datos.activoId ? null : datos.empleadoId || null,
    sedeId: datos.sedeId || null,
    responsable: datos.responsable || null,
    observaciones: datos.observaciones || null,
  };
}

/** Datos de una linea para la auditoria (sin fechas de sistema ni nombres). */
const foto = (l: LineaConNombres) => {
  const { id: _id, createdAt: _c, updatedAt: _u, plan: _p, estado: _e, tipoChip: _t, activo: _a, empleado: _m, ...datos } = l;
  return JSON.parse(JSON.stringify(datos)) as Prisma.InputJsonValue;
};

export async function crearLinea(datos: DatosLinea, usuario?: string | null) {
  await exigirNumeroLibre(datos.numero);
  await validarAsociados(datos);
  const vigenteDesde = fechaVigencia(datos.vigenteDesde);
  const data = await aGuardar(datos, vigenteDesde);
  return prisma.$transaction(async (tx) => {
    const linea = await tx.lineaTelefonica.create({ data, include: CON_NOMBRES });
    await registrarHistorial(tx, null, linea, { usuario, vigenteDesde });
    await abrirTenencia(tx, linea, { desde: vigenteDesde, origen: 'alta', usuario });
    await auditLogService.registrarCreacion('linea', linea.id, `Línea ${linea.numero} creada`, foto(linea), usuario, tx);
    return linea;
  });
}

/** Edita una linea; cambiar el estado (darla de baja, suspenderla...) tambien es editarla. */
export async function editarLinea(id: string, datos: DatosLinea, usuario?: string | null) {
  return prisma.$transaction(async (tx) => {
    // Leida ya bloqueada: una reasignacion simultanea espera y no se deshace.
    const actual = await lineaBloqueada(tx, id);
    await exigirNumeroLibre(datos.numero, id);
    await exigirChipCompatible(datos.tipoChipId, actual);
    // Donde esta la linea, con quien y su sede no se cambian aqui: eso es Reasignar.
    const d = { ...datos, activoId: actual.activoId, empleadoId: actual.empleadoId, responsable: actual.responsable, sedeId: actual.sedeId };
    await validarAsociados(d, actual);
    const vigenteDesde = fechaVigencia(datos.vigenteDesde);
    const data = await aGuardar(d, vigenteDesde, actual);
    const linea = await tx.lineaTelefonica.update({ where: { id }, data, include: CON_NOMBRES });
    await registrarHistorial(tx, actual, linea, { usuario, vigenteDesde });
    const accion = actual.estadoId === linea.estadoId ? 'editada' : `pasó a ${linea.estado.nombre}`;
    await auditLogService.registrarActualizacion('linea', id, `Línea ${linea.numero} ${accion}`, foto(actual), foto(linea), usuario, tx);
    return linea;
  });
}

/**
 * Reasigna una linea (SPEC 2.131): la lleva a otro telefono de la empresa (la
 * persona sale de el), a una persona (eSIM o telefono personal) o la deja sin
 * asignar. Nunca cambia quien tiene un telefono. Cierra su tramo de tenencia y
 * abre otro, con el motivo, y queda en la auditoria.
 */
export async function reasignarLinea(id: string, datos: DatosReasignacion, usuario?: string | null) {
  return prisma.$transaction(async (tx) => {
    const actual = await lineaBloqueada(tx, id);
    if (actual.estado.deBaja) throw new ConflictError('Una línea dada de baja no se asigna: cambia primero su estado');
    // Solo una disponible (sin persona): una asignada cambia con las solicitudes (SPEC 2.131).
    await exigirLineaDisponible(tx, actual);
    // Chip fisico -> celular de la empresa; eSIM -> persona (o sin asignar).
    const noPermitido = errorDeAsociacion(actual.tipoChip, datos.destino);
    if (noPermitido) throw errorDeCampo('destino', noPermitido);
    const desde = fechaDeCambio(datos.desde, 'desde');
    const destino = await destinoDeReasignacion(tx, datos);
    await exigirMotivo(tx, datos.motivoId);
    await exigirSede(tx, datos.sedeId, actual.sedeId);
    exigirCambio({ activoId: actual.activoId, empleadoId: actual.empleadoId, responsable: actual.responsable, sedeId: actual.sedeId }, destino);
    const linea = await tx.lineaTelefonica.update({ where: { id }, data: destino, include: CON_NOMBRES });
    await cambiarTenencia(tx, id, destino, { desde, origen: 'reasignacion', usuario, motivoId: datos.motivoId, detalle: datos.detalle });
    await auditLogService.registrarActualizacion('linea', id, `Línea ${linea.numero} reasignada`, foto(actual), foto(linea), usuario, tx);
    return linea;
  });
}

/** Ficha de una linea (pantalla de detalle): sus datos, quien la ha tenido, su historial y cuantas veces se reasigno. */
export async function fichaLinea(id: string) {
  const linea = await prisma.lineaTelefonica.findUnique({ where: { id }, include: CON_ASOCIADOS });
  if (!linea) throw new NotFoundError('Línea no encontrada');
  const [tenencias, historial] = await Promise.all([tenenciasDeLinea(id), historialLinea(id)]);
  return { linea, tenencias, historial, reasignaciones: Math.max(tenencias.length - 1, 0) };
}

/**
 * Por que una linea no se puede eliminar, o null si no tiene nada registrado
 * (SPEC 2.136): nunca tuvo persona, no se movio de donde se creo y no tuvo
 * cambios de precio, plan o estado (corregir sus datos no cuenta).
 */
async function motivoSinEliminarLinea(tx: Prisma.TransactionClient, id: string) {
  const [conPersona, tramos, cambios] = await Promise.all([
    tx.lineaTenencia.count({ where: { lineaId: id, empleadoId: { not: null } } }),
    tx.lineaTenencia.count({ where: { lineaId: id } }),
    tx.lineaHistorial.count({ where: { lineaId: id, tipo: { notIn: ['creacion', 'importacion', 'datos'] } } }),
  ]);
  if (conPersona > 0) return 'ya la ha usado una persona';
  if (tramos > 1) return 'ya se cambió de lugar';
  if (cambios > 0) return 'ya tuvo cambios de precio, plan o estado';
  return null;
}

/**
 * Borra una linea ingresada por error (admin y tecnico, SPEC 2.136), solo si no
 * tiene nada registrado. Su historial queda, con un evento de cierre, y sus
 * datos en la auditoria. Una linea que ya se uso se pasa a Dada de baja.
 */
export async function eliminarLinea(id: string, usuario?: string | null) {
  await prisma.$transaction(async (tx) => {
    const actual = await lineaBloqueada(tx, id);
    const motivo = await motivoSinEliminarLinea(tx, id);
    if (motivo) throw new ConflictError(`No se puede eliminar: ${motivo}. Si ya no se usa, pásala a Dada de baja.`);
    await registrarEliminacion(tx, actual, usuario);
    await tx.lineaTelefonica.delete({ where: { id } });
    await auditLogService.registrarEliminacion('linea', id, `Línea ${actual.numero} eliminada`, foto(actual), usuario, tx);
  });
}

/**
 * Lo que ofrecen los formularios de crear y asignar: celulares sin persona (la
 * recibe con una solicitud, SPEC 2.131), personas activas y catalogos activos.
 */
export async function opcionesLinea() {
  const activos = { where: { activo: true }, orderBy: { nombre: 'asc' as const } };
  const [celulares, personas, tiposChip, planes, estados, sedes, operadores] = await Promise.all([
    prisma.asset.findMany({
      where: { deletedAt: null, estado: { notIn: ['baja', 'vendido'] }, empleadoActualId: null, categoria: { tipoFicha: 'celular' } },
      select: { id: true, marca: true, modelo: true, imei: true, sedeId: true, empleadoActual: PERSONA },
      orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { estado: { not: 'desvinculado' } },
      select: { id: true, nombres: true, apellidoPaterno: true, rut: true },
      orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }],
    }),
    prisma.tipoChip.findMany({ ...activos, select: { id: true, nombre: true, sinCelular: true } }),
    prisma.planLinea.findMany({ ...activos, select: { id: true, nombre: true, precioMensual: true } }),
    prisma.estadoLinea.findMany({ ...activos, select: { id: true, nombre: true, deBaja: true, clave: true } }),
    prisma.sede.findMany({ where: { activa: true }, select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
    prisma.operadorLinea.findMany({ ...activos, select: { id: true, nombre: true } }),
  ]);
  return { celulares, personas, tiposChip, planes, estados, sedes, operadores };
}
