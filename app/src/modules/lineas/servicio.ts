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
  fechaDeCambio,
  tenenciasDeLinea,
} from '@/modules/lineas/tenencia';
import { errorDeAsociacion, type DatosBajaLinea, type DatosLinea, type DatosReasignacion, type DestinoLinea } from '@/modules/lineas/validaciones';

/**
 * Lineas telefonicas (SPEC 2.131). Cada linea es un registro propio que se
 * asocia a un celular; la persona es quien tiene ese celular. Sin celular
 * (chip o eSIM en un telefono personal), la persona se guarda en la linea.
 * Estado, tipo de chip y operador son catalogos; cada cambio queda en el
 * historial de la linea y en la auditoria. Donde esta y con quien (telefono,
 * persona) se fija al crearla y solo cambia con `reasignarLinea` o cuando su
 * telefono cambia de manos (tenencia.ts), y cada tramo queda anotado.
 */

// Con su estado: una linea de una persona desvinculada se marca para revisar.
const PERSONA = { select: { id: true, nombres: true, apellidoPaterno: true, rut: true, estado: true, sede: { select: { nombre: true } } } } as const;

const CON_ASOCIADOS = {
  activo: { select: { id: true, marca: true, modelo: true, imei: true, sede: { select: { nombre: true } }, empleadoActual: PERSONA } },
  empleado: PERSONA,
  tipoChip: { select: { id: true, nombre: true, sinCelular: true } },
  operador: { select: { id: true, nombre: true } },
  estado: { select: { id: true, nombre: true, deBaja: true, clave: true } },
} satisfies Prisma.LineaTelefonicaInclude;

/** Lineas con los filtros de la pantalla (SPEC 2.131: estado, catalogos, asignacion, sede del navbar y texto), por numero. */
export async function listarLineas(filtros: FiltrosLineas = {}) {
  return prisma.lineaTelefonica.findMany({
    where: whereFiltrosLineas(filtros),
    include: CON_ASOCIADOS,
    orderBy: { numero: 'asc' },
  });
}

/** Una opcion de catalogo elegida tiene que existir y estar activa, salvo que la linea ya la tuviera. */
async function exigirOpcion(
  campo: 'estadoId' | 'tipoChipId' | 'operadorId',
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
  await exigirOpcion('estadoId', datos.estadoId, actual?.estadoId, (id) => prisma.estadoLinea.findUnique({ where: { id } }));
  await exigirOpcion('tipoChipId', datos.tipoChipId, actual?.tipoChipId, (id) => prisma.tipoChip.findUnique({ where: { id } }));
  await exigirOpcion('operadorId', datos.operadorId, actual?.operadorId, (id) => prisma.operadorLinea.findUnique({ where: { id } }));
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
async function aGuardar(datos: DatosLinea, vigenteDesde: Date, actual?: LineaConNombres) {
  const estado = datos.estadoId
    ? await prisma.estadoLinea.findUniqueOrThrow({ where: { id: datos.estadoId } })
    : actual
      ? { id: actual.estadoId, deBaja: actual.estado.deBaja }
      : await estadoPorClave(prisma, 'activa');
  const sigueDeBaja = !!actual?.estado.deBaja && estado.deBaja;
  // Dar de baja una linea pide su motivo: tiene su propio paso (SPEC 2.140).
  if (estado.deBaja && !sigueDeBaja) throw errorDeCampo('estadoId', 'Para dar de baja una línea usa «Dar de baja», que pide el motivo');
  return {
    numero: datos.numero,
    estadoId: estado.id,
    fechaBaja: sigueDeBaja ? actual!.fechaBaja : null,
    motivoBajaId: sigueDeBaja ? actual!.motivoBajaId : null,
    motivoBaja: sigueDeBaja ? actual!.motivoBaja : null,
    tipoChipId: datos.tipoChipId || null,
    operadorId: datos.operadorId || null,
    activoId: datos.activoId || null,
    empleadoId: datos.activoId ? null : datos.empleadoId || null,
    observaciones: datos.observaciones || null,
  };
}

/** Datos de una linea para la auditoria (sin fechas de sistema ni nombres). */
const foto = (l: LineaConNombres) => {
  const { id: _id, createdAt: _c, updatedAt: _u, estado: _e, tipoChip: _t, activo: _a, empleado: _m, ...datos } = l;
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

/** Edita una linea; cambiar el estado (darla de baja o reactivarla) tambien es editarla. */
export async function editarLinea(id: string, datos: DatosLinea, usuario?: string | null) {
  return prisma.$transaction(async (tx) => {
    // Leida ya bloqueada: una reasignacion simultanea espera y no se deshace.
    const actual = await lineaBloqueada(tx, id);
    await exigirNumeroLibre(datos.numero, id);
    await exigirChipCompatible(datos.tipoChipId, actual);
    // Donde esta la linea y con quien no se cambian aqui: eso es Reasignar.
    const d = { ...datos, activoId: actual.activoId, empleadoId: actual.empleadoId };
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

/** Motivo de la lista elegido para una baja ("Otro" exige el detalle) y el texto que se muestra. */
async function motivoDeBaja(tx: Prisma.TransactionClient, datos: DatosBajaLinea) {
  const elegido = await tx.motivoBajaLinea.findFirst({ where: { id: datos.motivoBajaId, activo: true } });
  if (!elegido) throw errorDeCampo('motivoBajaId', 'Elige un motivo de baja de la lista');
  const detalle = datos.motivoDetalle?.trim();
  if (elegido.clave === 'otro' && !detalle) throw errorDeCampo('motivoDetalle', 'Describe el motivo cuando eliges "Otro"');
  return { id: elegido.id, texto: detalle ? `${elegido.nombre}: ${detalle}` : elegido.nombre };
}

/**
 * Da de baja una linea (SPEC 2.140): pasa a Baja con su motivo de la lista y su
 * fecha (por defecto, hoy). Queda en su historial y en la auditoria. Volver a activarla es
 * editarla.
 */
export async function darDeBajaLinea(id: string, datos: DatosBajaLinea, usuario?: string | null) {
  return prisma.$transaction(async (tx) => {
    const actual = await lineaBloqueada(tx, id);
    if (actual.estado.deBaja) throw new ConflictError('La línea ya está dada de baja');
    const baja = await estadoPorClave(tx, 'baja');
    const fecha = fechaVigencia(datos.fechaBaja);
    const motivo = await motivoDeBaja(tx, datos);
    const linea = await tx.lineaTelefonica.update({
      where: { id },
      data: { estadoId: baja.id, fechaBaja: fecha, motivoBajaId: motivo.id, motivoBaja: motivo.texto },
      include: CON_NOMBRES,
    });
    await registrarHistorial(tx, actual, linea, { usuario, vigenteDesde: fecha, observaciones: datos.observaciones });
    await auditLogService.registrarActualizacion('linea', id, `Línea ${linea.numero} dada de baja: ${motivo.texto}`, foto(actual), foto(linea), usuario, tx);
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
  return prisma.$transaction((tx) => reasignarLineaEnTx(tx, id, datos, usuario));
}

/** Lo mismo que reasignarLinea, dentro de la transaccion de quien la llama (una solicitud). */
export async function reasignarLineaEnTx(tx: Prisma.TransactionClient, id: string, datos: DatosReasignacion, usuario?: string | null) {
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
  exigirCambio({ activoId: actual.activoId, empleadoId: actual.empleadoId }, destino);
  const linea = await tx.lineaTelefonica.update({ where: { id }, data: destino, include: CON_NOMBRES });
  await cambiarTenencia(tx, id, destino, { desde, origen: 'reasignacion', usuario, motivoId: datos.motivoId, detalle: datos.detalle });
  await auditLogService.registrarActualizacion('linea', id, `Línea ${linea.numero} reasignada`, foto(actual), foto(linea), usuario, tx);
  return linea;
}

/**
 * Asocia una linea disponible al entregar un celular en una solicitud (SPEC 2.143),
 * con las mismas reglas de Asignar: un chip fisico queda en el celular (que aun no
 * tiene persona: la recibe con la entrega) y una eSIM, con la persona.
 */
export async function asociarLineaEnSolicitud(
  tx: Prisma.TransactionClient,
  lineaId: string,
  c: { activoId: string; empleadoId: string; detalle: string; usuario?: string | null }
) {
  const linea = await tx.lineaTelefonica.findUnique({ where: { id: lineaId }, select: { tipoChip: { select: { sinCelular: true } } } });
  if (!linea) throw errorDeCampo('lineaId', 'La línea no existe');
  if (!linea.tipoChip) throw errorDeCampo('lineaId', 'La línea no tiene tipo de chip: indícalo en Líneas');
  const aPersona = linea.tipoChip.sinCelular;
  return reasignarLineaEnTx(
    tx,
    lineaId,
    { destino: aPersona ? 'persona' : 'telefono', activoId: aPersona ? undefined : c.activoId, empleadoId: aPersona ? c.empleadoId : undefined, detalle: c.detalle },
    c.usuario
  );
}

/** Una eSIM queda con la persona que usa su propio telefono (onboarding, SPEC 2.143). */
export async function asociarEsimEnSolicitud(
  tx: Prisma.TransactionClient,
  lineaId: string,
  c: { empleadoId: string; detalle: string; usuario?: string | null }
) {
  const linea = await tx.lineaTelefonica.findUnique({ where: { id: lineaId }, select: { tipoChip: { select: { sinCelular: true } } } });
  if (!linea) throw errorDeCampo('lineaId', 'La línea no existe');
  if (!linea.tipoChip?.sinCelular) throw errorDeCampo('lineaId', 'La línea elegida no es una eSIM');
  return reasignarLineaEnTx(tx, lineaId, { destino: 'persona', empleadoId: c.empleadoId, detalle: c.detalle }, c.usuario);
}

/**
 * Libera una linea que tiene la persona, en un Cambio de equipo (SPEC 2.143): queda disponible
 * (sin persona ni celular), con su tramo «Línea anterior - <detalle>». Con soloEsim, exige una eSIM.
 */
export async function liberarLineaEnSolicitud(
  tx: Prisma.TransactionClient,
  c: { lineaId: string; empleadoId: string; detalle: string; usuario?: string | null; soloEsim?: boolean }
) {
  const anterior = await lineaBloqueada(tx, c.lineaId);
  if (anterior.estado.deBaja) throw new ConflictError(`La línea ${anterior.numero} está dada de baja`);
  const telefono = anterior.activoId
    ? await tx.asset.findUnique({ where: { id: anterior.activoId }, select: { empleadoActualId: true } })
    : null;
  if ((anterior.activoId ? telefono?.empleadoActualId : anterior.empleadoId) !== c.empleadoId) {
    throw new ConflictError(`La línea ${anterior.numero} no la tiene esta persona`);
  }
  if (c.soloEsim && anterior.activoId) throw errorDeCampo('lineaId', `La línea ${anterior.numero} está en un celular, no es una eSIM`);
  const libre = { activoId: null, empleadoId: null };
  const sale = await tx.lineaTelefonica.update({ where: { id: anterior.id }, data: libre, include: CON_NOMBRES });
  await cambiarTenencia(tx, anterior.id, libre, { desde: new Date(), origen: 'reasignacion', usuario: c.usuario, detalle: `Línea anterior - ${c.detalle}` });
  await auditLogService.registrarActualizacion('linea', anterior.id, `Línea ${sale.numero} cambiada`, foto(anterior), foto(sale), c.usuario, tx);
  return anterior;
}

/**
 * Cambia una linea de la persona por otra disponible del mismo tipo, en un Cambio de equipo
 * (SPEC 2.143): la de un celular, por otro chip fisico en ese celular; una eSIM, por otra eSIM.
 * La anterior queda disponible. Pasar a eSIM es devolver el celular (cambio del celular) y pasar
 * de eSIM a chip fisico es recibir un celular (lo arma la solicitud).
 * El celular ya tiene a la persona, asi que no pasa por exigirCelularDisponible.
 */
export async function cambiarLineaEnSolicitud(
  tx: Prisma.TransactionClient,
  c: { lineaId: string; nuevaLineaId: string; empleadoId: string; detalle: string; usuario?: string | null }
) {
  const nueva = await lineaBloqueada(tx, c.nuevaLineaId);
  if (nueva.estado.deBaja) throw errorDeCampo('newLineaId', 'La línea nueva está dada de baja');
  await exigirLineaDisponible(tx, nueva);
  if (!nueva.tipoChip) throw errorDeCampo('newLineaId', 'La línea nueva no tiene tipo de chip: indícalo en Líneas');
  const anterior = await liberarLineaEnSolicitud(tx, c);
  const esEsim = nueva.tipoChip.sinCelular;
  if (anterior.activoId && esEsim) {
    throw errorDeCampo('newLineaId', 'Para pasar a eSIM se devuelve el celular con su línea: elige eSIM en el cambio del celular');
  }
  if (!anterior.activoId && !esEsim) {
    throw errorDeCampo('newLineaId', 'Para pasar de eSIM a chip físico se entrega un celular: elige el celular');
  }
  const destino = esEsim ? { activoId: null, empleadoId: c.empleadoId } : { activoId: anterior.activoId, empleadoId: null };
  const entra = await tx.lineaTelefonica.update({ where: { id: nueva.id }, data: destino, include: CON_NOMBRES });
  await cambiarTenencia(tx, nueva.id, destino, { desde: new Date(), origen: 'reasignacion', usuario: c.usuario, detalle: c.detalle });
  await auditLogService.registrarActualizacion('linea', nueva.id, `Línea ${entra.numero} asignada`, foto(nueva), foto(entra), c.usuario, tx);
  return entra;
}

/** Ficha de una linea (pantalla de detalle): sus datos, quien la ha tenido, su historial y cuantas veces se reasigno. */
export async function fichaLinea(id: string) {
  const linea = await prisma.lineaTelefonica.findUnique({ where: { id }, include: CON_ASOCIADOS });
  if (!linea) throw new NotFoundError('Línea no encontrada');
  const [tenencias, historial] = await Promise.all([tenenciasDeLinea(id), historialLinea(id)]);
  // Cuantas personas distintas la han usado (la tarjeta "Personas" de la ficha).
  const personas = new Set(tenencias.flatMap((t) => (t.empleadoId ? [t.empleadoId] : []))).size;
  return { linea, tenencias, historial, reasignaciones: Math.max(tenencias.length - 1, 0), personas };
}

/**
 * Por que una linea no se puede eliminar, o null si no tiene nada registrado
 * (SPEC 2.136): nunca tuvo persona, no se movio de donde se creo y no tuvo
 * cambios de estado (corregir sus datos no cuenta).
 */
async function motivoSinEliminarLinea(tx: Prisma.TransactionClient, id: string) {
  const [conPersona, tramos, cambios] = await Promise.all([
    tx.lineaTenencia.count({ where: { lineaId: id, empleadoId: { not: null } } }),
    tx.lineaTenencia.count({ where: { lineaId: id } }),
    tx.lineaHistorial.count({ where: { lineaId: id, tipo: 'estado' } }),
  ]);
  if (conPersona > 0) return 'ya la ha usado una persona';
  if (tramos > 1) return 'ya se cambió de lugar';
  if (cambios > 0) return 'ya tuvo cambios de estado';
  return null;
}

/**
 * Borra una linea ingresada por error (admin y tecnico, SPEC 2.136), solo si no
 * tiene nada registrado. Su historial queda, con un evento de cierre, y sus
 * datos en la auditoria. Una linea que ya se uso se pasa a Baja.
 */
export async function eliminarLinea(id: string, usuario?: string | null) {
  await prisma.$transaction(async (tx) => {
    const actual = await lineaBloqueada(tx, id);
    const motivo = await motivoSinEliminarLinea(tx, id);
    if (motivo) throw new ConflictError(`No se puede eliminar: ${motivo}. Si ya no se usa, pásala a Baja.`);
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
  const [celulares, personas, tiposChip, estados, operadores] = await Promise.all([
    prisma.asset.findMany({
      where: { deletedAt: null, estado: { not: 'baja' }, empleadoActualId: null, categoria: { tipoFicha: 'celular' } },
      select: { id: true, marca: true, modelo: true, imei: true, sedeId: true, empleadoActual: PERSONA },
      orderBy: [{ marca: 'asc' }, { modelo: 'asc' }],
    }),
    prisma.employee.findMany({
      where: { estado: { not: 'desvinculado' } },
      select: { id: true, nombres: true, apellidoPaterno: true, rut: true },
      orderBy: [{ apellidoPaterno: 'asc' }, { nombres: 'asc' }],
    }),
    prisma.tipoChip.findMany({ ...activos, select: { id: true, nombre: true, sinCelular: true } }),
    prisma.estadoLinea.findMany({ ...activos, select: { id: true, nombre: true, deBaja: true, clave: true } }),
    prisma.operadorLinea.findMany({ ...activos, select: { id: true, nombre: true } }),
  ]);
  return { celulares, personas, tiposChip, estados, operadores };
}
