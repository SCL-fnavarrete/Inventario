import type { OrigenTenencia, Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, errorDeCampo } from '@/shared/errores';
import type { DatosReasignacion } from '@/modules/lineas/validaciones';
import { registrarMovimiento } from '@/modules/lineas/historial';
import { NOMBRE } from '@/modules/activos';

/**
 * Tenencia de las lineas (SPEC 2.131): cada tramo de tiempo en que una linea
 * estuvo en un telefono y/o con una persona. Un cambio cierra el tramo actual y
 * abre otro, asi la linea recuerda a sus propietarios anteriores, igual que el
 * equipo guarda sus asignaciones. Quien la tiene es la persona del telefono
 * donde esta; solo sin telefono de la empresa (eSIM, telefono personal) la
 * persona se guarda en la propia linea. Los tramos de una persona alimentan su
 * historial.
 */

type Tx = Prisma.TransactionClient;

/** Donde y con quien esta una linea (lo que cambia entre un tramo y otro). */
type Ubicacion = { activoId: string | null; empleadoId: string | null };

type Cambio = {
  desde: Date;
  origen: OrigenTenencia;
  usuario?: string | null;
  motivoId?: string | null;
  detalle?: string | null;
};

const dia = (d: Date) => d.toISOString().slice(0, 10);

/** Fecha desde la que rige un cambio: la indicada o ahora. No puede ser futura. */
export function fechaDeCambio(texto: string | null | undefined, campo = 'vigenteDesde'): Date {
  const fecha = texto ? new Date(texto) : new Date();
  if (fecha.getTime() > Date.now() + 86_400_000) throw errorDeCampo(campo, 'La fecha no puede ser futura');
  return fecha;
}

/** La persona de una linea: la que tiene su telefono o, sin telefono, la guardada en la linea. */
async function personaDe(tx: Tx, u: { activoId: string | null; empleadoId: string | null }) {
  if (!u.activoId) return u.empleadoId;
  const telefono = await tx.asset.findUnique({ where: { id: u.activoId }, select: { empleadoActualId: true } });
  return telefono?.empleadoActualId ?? null;
}

/** Mensaje de por que una linea asignada no se asigna desde Lineas. */
export const LINEA_ASIGNADA =
  'La línea está asignada: cambia de persona con una solicitud (al entregar, cambiar o devolver su celular; una eSIM se libera con la devolución por término).';

/**
 * Solo una linea disponible (sin persona) se asigna desde Lineas (SPEC 2.131).
 * Una asignada cambia de persona con las solicitudes: la de un celular sigue al
 * celular, y una eSIM se libera con la devolucion por termino.
 */
export async function exigirLineaDisponible(tx: Tx, l: { activoId: string | null; empleadoId: string | null }) {
  if (await personaDe(tx, l)) throw new ConflictError(LINEA_ASIGNADA);
}

/**
 * Un celular para una linea (SPEC 2.164): del inventario, vigente y sin otra
 * linea vigente; con o sin persona (si la tiene, la persona pasa a usar la linea).
 * `lineaId` es la que se asigna: no cuenta como "otra". Dentro de una transaccion
 * bloquea el celular hasta el final: dos lineas a la vez no caben en el mismo.
 */
export async function exigirCelularDisponible(tx: Tx, activoId: string, lineaId?: string) {
  await tx.$queryRaw`SELECT id FROM assets WHERE id = ${activoId} FOR UPDATE`;
  const telefono = await tx.asset.findFirst({
    where: { id: activoId, deletedAt: null },
    select: {
      estado: true,
      categoria: { select: { tipoFicha: true } },
      lineas: { where: { estado: { deBaja: false }, ...(lineaId && { id: { not: lineaId } }) }, select: { id: true }, take: 1 },
    },
  });
  if (telefono?.categoria.tipoFicha !== 'celular') throw errorDeCampo('activoId', 'Elige un celular del inventario');
  if (telefono.estado === 'baja') throw errorDeCampo('activoId', 'Ese celular está de baja');
  if (telefono.lineas.length) throw errorDeCampo('activoId', 'Ese celular ya tiene una línea: elige uno sin línea');
}

/**
 * Sede donde queda un chip que pasa a disponible (SPEC 2.165): la del celular o
 * la persona donde estaba; si no tenian, la que ya tenia la linea.
 */
export async function sedeAlLiberar(tx: Tx, l: { activoId: string | null; empleadoId: string | null; sedeId: string | null }) {
  const donde = l.activoId
    ? await tx.asset.findUnique({ where: { id: l.activoId }, select: { sedeId: true } })
    : l.empleadoId
      ? await tx.employee.findUnique({ where: { id: l.empleadoId }, select: { sedeId: true } })
      : null;
  return donde?.sedeId ?? l.sedeId;
}

/**
 * Devolucion por termino (SPEC 2.131): las eSIM vigentes de la persona quedan
 * disponibles (sin persona), con su tramo de tenencia. Las de un celular no se
 * tocan: siguen a su celular, que vuelve con la devolucion. Devuelve los ids de las que libero.
 */
export async function liberarEsimDePersona(tx: Tx, empleadoId: string, c: { usuario?: string | null; detalle?: string | null } = {}) {
  const lineas = await tx.lineaTelefonica.findMany({
    where: { empleadoId, activoId: null, estado: { deBaja: false } },
    select: { id: true, activoId: true, empleadoId: true, sedeId: true },
  });
  for (const l of lineas) {
    // Queda disponible en la sede de la persona (SPEC 2.165).
    await tx.lineaTelefonica.update({ where: { id: l.id }, data: { empleadoId: null, sedeId: await sedeAlLiberar(tx, l) } });
    await cerrarYAbrir(
      tx,
      l.id,
      { activoId: null, empleadoId: null },
      { desde: new Date(), origen: 'termino', usuario: c.usuario, detalle: c.detalle }
    );
  }
  return lineas.map((l) => l.id);
}

/**
 * Bloquea la linea hasta que termine la transaccion: dos cambios simultaneos de
 * una misma linea van uno tras otro, asi nunca quedan dos tramos abiertos ni un
 * cambio pisa a otro.
 */
export async function bloquearLinea(tx: Tx, lineaId: string) {
  await tx.$queryRaw`SELECT id FROM lineas_telefonicas WHERE id = ${lineaId} FOR UPDATE`;
}

/** Cierra el tramo abierto de la linea (si hay) y abre otro con lo nuevo. */
async function cerrarYAbrir(tx: Tx, lineaId: string, nuevo: Ubicacion, c: Cambio) {
  await bloquearLinea(tx, lineaId);
  const abierto = await tx.lineaTenencia.findFirst({ where: { lineaId, hasta: null }, orderBy: { desde: 'desc' } });
  let desde = c.desde;
  if (abierto) {
    if (dia(desde) < dia(abierto.desde)) {
      throw errorDeCampo('desde', `La fecha no puede ser anterior al inicio del tramo actual (${dia(abierto.desde)})`);
    }
    // El mismo dia de un cambio anterior: queda justo despues, sin pisarlo.
    if (desde < abierto.desde) desde = abierto.desde;
    await tx.lineaTenencia.updateMany({ where: { lineaId, hasta: null }, data: { hasta: desde } });
  }
  await tx.lineaTenencia.create({
    data: {
      lineaId,
      activoId: nuevo.activoId,
      empleadoId: nuevo.empleadoId,
      desde,
      origen: c.origen,
      motivoId: c.motivoId ?? null,
      detalle: c.detalle?.slice(0, 500) ?? null,
      usuario: c.usuario ?? null,
    },
  });
  // Un cambio de lugar queda en el historial de eventos. El alta y la importacion ya
  // dejan el suyo (registrarHistorial); el primer tramo no es un cambio.
  if (abierto && c.origen !== 'alta' && c.origen !== 'importacion') {
    await registrarMovimiento(tx, lineaId, { activoId: abierto.activoId, empleadoId: abierto.empleadoId }, nuevo, { ...c, desde });
  }
}

/** Primer tramo de una linea recien creada o importada: con quien y donde esta desde el alta. */
export async function abrirTenencia(
  tx: Tx,
  linea: { id: string; activoId: string | null; empleadoId: string | null },
  c: Cambio
) {
  const empleadoId = await personaDe(tx, linea);
  await cerrarYAbrir(tx, linea.id, { activoId: linea.activoId, empleadoId }, c);
}

/**
 * Entregas anteriores de una linea importada (un numero repetido en el archivo):
 * tramos ya cerrados, del mas antiguo al mas nuevo, que terminan donde empieza el
 * siguiente (el ultimo, donde empieza el actual). Guardan la persona de esa
 * fila, no la del telefono de hoy. Las fechas ya vienen en orden.
 */
export async function registrarEntregasAnteriores(
  tx: Tx,
  lineaId: string,
  entregas: (Ubicacion & { desde: Date })[],
  inicioDelActual: Date,
  usuario?: string | null
) {
  for (const [i, e] of entregas.entries()) {
    const fin = entregas[i + 1]?.desde ?? inicioDelActual;
    await tx.lineaTenencia.create({
      data: {
        lineaId,
        activoId: e.activoId,
        empleadoId: e.empleadoId,
        desde: e.desde,
        hasta: fin < e.desde ? e.desde : fin,
        origen: 'importacion',
        detalle: 'Entrega anterior registrada en el archivo',
        usuario: usuario ?? null,
      },
    });
  }
}

/** Cambia donde esta la linea: cierra su tramo y abre el nuevo, con la persona que resulta. */
export async function cambiarTenencia(tx: Tx, lineaId: string, nuevo: Ubicacion, c: Cambio) {
  const empleadoId = await personaDe(tx, nuevo);
  await cerrarYAbrir(tx, lineaId, { ...nuevo, empleadoId }, c);
}

/**
 * Un telefono cambio de manos (entrega o devolucion): las lineas vigentes que
 * estan en el pasan con la persona nueva, o quedan sin persona si se devolvio.
 * La llama `cambiarEstado` de Activos, el unico camino por el que cambia quien
 * tiene un equipo, dentro de la misma operacion.
 */
export async function alCambiarTenedorDelTelefono(
  tx: Tx,
  p: { activoId: string; de: string | null; a: string | null; detalle?: string | null }
) {
  if (p.de === p.a) return;
  const lineas = await tx.lineaTelefonica.findMany({
    where: { activoId: p.activoId, estado: { deBaja: false } },
    select: { id: true },
  });
  for (const l of lineas) {
    await cerrarYAbrir(
      tx,
      l.id,
      { activoId: p.activoId, empleadoId: p.a },
      { desde: new Date(), origen: p.a ? 'entrega_telefono' : 'devolucion_telefono', detalle: p.detalle }
    );
  }
}

/**
 * Valida el destino de una reasignacion y devuelve donde queda la linea: en un
 * telefono de la empresa (la persona sale de el), con una persona (eSIM o
 * telefono personal) o sin asignar.
 */
export async function destinoDeReasignacion(tx: Tx, d: DatosReasignacion, lineaId?: string): Promise<Ubicacion> {
  if (d.destino === 'telefono') {
    await exigirCelularDisponible(tx, d.activoId!, lineaId);
    return { activoId: d.activoId!, empleadoId: null };
  }
  if (d.destino === 'persona') {
    const persona = await tx.employee.findUnique({ where: { id: d.empleadoId! }, select: { estado: true } });
    if (!persona) throw errorDeCampo('empleadoId', 'La persona no existe');
    if (persona.estado === 'desvinculado') throw errorDeCampo('empleadoId', 'La persona está desvinculada');
    return { activoId: null, empleadoId: d.empleadoId! };
  }
  return { activoId: null, empleadoId: null };
}

/** El motivo elegido tiene que existir y estar activo. */
export async function exigirMotivo(tx: Tx, motivoId: string | null | undefined) {
  if (!motivoId) return;
  const motivo = await tx.motivoReasignacion.findUnique({ where: { id: motivoId } });
  if (!motivo?.activo) throw errorDeCampo('motivoId', 'Elige un motivo de la lista');
}

/** Si la reasignacion no cambia nada se rechaza: seria un tramo igual al anterior. */
export function exigirCambio(antes: Ubicacion, despues: Ubicacion) {
  if (antes.activoId === despues.activoId && antes.empleadoId === despues.empleadoId) {
    throw new ConflictError('La línea ya está así: elige otro teléfono o persona');
  }
}

const DETALLE = {
  activo: { select: { id: true, marca: NOMBRE, modelo: true, imei: true } },
  empleado: { select: { id: true, nombres: true, apellidoPaterno: true, rut: true } },
  motivo: { select: { nombre: true } },
} satisfies Prisma.LineaTenenciaInclude;

/** Los tramos de una linea, del mas nuevo al mas antiguo (el primero es el actual). */
export function tenenciasDeLinea(lineaId: string) {
  return prisma.lineaTenencia.findMany({
    where: { lineaId },
    include: DETALLE,
    orderBy: [{ desde: 'desc' }, { createdAt: 'desc' }],
  });
}

/**
 * Los tramos en que una persona tuvo una linea, del mas nuevo al mas antiguo
 * (para su historial). `cierre` dice como termino cada tramo cerrado: con que
 * origen empezo el tramo que le siguio (devolvio el telefono, paso a otra
 * persona, reasignacion).
 */
export async function tenenciasDePersona(empleadoId: string) {
  const tramos = await prisma.lineaTenencia.findMany({
    where: { empleadoId },
    include: { ...DETALLE, linea: { select: { id: true, numero: true } } },
    orderBy: [{ desde: 'desc' }, { createdAt: 'desc' }],
  });
  const lineaIds = [...new Set(tramos.map((t) => t.lineaId))];
  const todos = lineaIds.length
    ? await prisma.lineaTenencia.findMany({
        where: { lineaId: { in: lineaIds } },
        select: { id: true, lineaId: true, origen: true },
        // Mismo orden que la ficha: `desde` nunca retrocede en una linea, y los
        // tramos de una misma operacion comparten `createdAt`.
        orderBy: [{ desde: 'asc' }, { createdAt: 'asc' }],
      })
    : [];
  // El tramo que sigue a cada uno en su linea, en una sola pasada.
  const siguiente = new Map<string, (typeof todos)[number]['origen']>();
  const ultimoDeLinea = new Map<string, string>();
  for (const o of todos) {
    const anterior = ultimoDeLinea.get(o.lineaId);
    if (anterior) siguiente.set(anterior, o.origen);
    ultimoDeLinea.set(o.lineaId, o.id);
  }
  return tramos.map((t) => ({ ...t, cierre: t.hasta ? (siguiente.get(t.id) ?? null) : null }));
}

/** Desde cuando tiene cada linea su tramo actual (el abierto): la fecha en que quedo con su persona. */
export async function desdeTenenciaActual(lineaIds: string[]) {
  const tramos = await prisma.lineaTenencia.findMany({ where: { lineaId: { in: lineaIds }, hasta: null }, select: { lineaId: true, desde: true } });
  return new Map(tramos.map((t) => [t.lineaId, t.desde]));
}
