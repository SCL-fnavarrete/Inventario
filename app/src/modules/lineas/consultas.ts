import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { SIN_DATO_LINEA, type FiltrosLineas } from '@/modules/lineas/filtros';
import { NOMBRE } from '@/modules/activos';

/**
 * Los filtros de Activos > Lineas como consulta (SPEC 2.131). La lista, las
 * tarjetas y las tablas usan esta misma funcion, asi cuentan lo mismo.
 */

// Tiene persona: la que tiene su celular o, sin celular, la guardada en la linea.
const CON_PERSONA: Prisma.LineaTelefonicaWhereInput = {
  OR: [{ activo: { empleadoActualId: { not: null } } }, { activoId: null, empleadoId: { not: null } }],
};

const ASIGNACION: Record<string, Prisma.LineaTelefonicaWhereInput> = {
  con: CON_PERSONA,
  sin: { NOT: CON_PERSONA },
};

/** Sin estado, todas. Un estado del catalogo por id; "vigentes" y "baja" agrupan (los usan las tarjetas). */
function porEstado(estado?: string): Prisma.LineaTelefonicaWhereInput {
  if (!estado || estado === 'todas') return {};
  if (estado === 'vigentes') return { estado: { deBaja: false } };
  if (estado === 'baja') return { estado: { deBaja: true } };
  return { estadoId: estado };
}

/** Un catalogo por id, o los que no lo tienen. */
const porId = (campo: 'tipoChipId' | 'operadorId', valor?: string): Prisma.LineaTelefonicaWhereInput =>
  !valor ? {} : { [campo]: valor === SIN_DATO_LINEA ? null : valor };

/** Motivo de baja: el id elegido, o "Baja sin motivo" (de baja pero sin motivo guardado). */
const porMotivoBaja = (valor?: string): Prisma.LineaTelefonicaWhereInput =>
  !valor ? {} : valor === SIN_DATO_LINEA ? { estado: { deBaja: true }, motivoBajaId: null } : { motivoBajaId: valor };

/**
 * Sede del navbar: la de su celular; sin celular, la de su persona; disponible
 * (sin celular ni persona), la sede donde se guarda el chip (SPEC 2.165).
 */
export function deSede(sedeId?: string): Prisma.LineaTelefonicaWhereInput {
  if (!sedeId) return {};
  return {
    OR: [{ activo: { sedeId } }, { activoId: null, empleado: { sedeId } }, { activoId: null, empleadoId: null, sedeId }],
  };
}

/** "+56 9 1234 5678" busca por numero; un texto, por persona o celular (operador y tipo de chip tienen su filtro). */
function busqueda(q?: string): Prisma.LineaTelefonicaWhereInput {
  const texto = q?.trim();
  if (!texto) return {};
  const c = { contains: texto, mode: 'insensitive' as const };
  const digitos = /^[\d\s+()-]+$/.test(texto) ? texto.replace(/\D/g, '') : '';
  return {
    OR: [
      ...(digitos ? [{ numero: { contains: digitos } }] : []),
      { empleado: { OR: [{ nombres: c }, { apellidoPaterno: c }, { rut: c }] } },
      { activo: { OR: [{ imei: c }, { modelo: c }] } },
      { activo: { empleadoActual: { OR: [{ nombres: c }, { apellidoPaterno: c }, { rut: c }] } } },
    ],
  };
}

/**
 * Los filtros como consulta. Con `sinTarjeta`, sin estado ni asignacion: es la base de las tarjetas de cantidad, que cuentan cada uno
 * de esos grupos (si no, al elegir una tarjeta las demas quedarian en cero).
 */
export function whereFiltrosLineas(f: FiltrosLineas, { sinTarjeta = false } = {}): Prisma.LineaTelefonicaWhereInput {
  const y: Prisma.LineaTelefonicaWhereInput[] = [
    deSede(f.sedeId),
    porId('tipoChipId', f.tipoChip),
    porId('operadorId', f.operador),
    porMotivoBaja(f.motivoBaja),
    busqueda(f.q),
  ];
  if (!sinTarjeta) {
    y.push(porEstado(f.estado));
    if (f.asignacion) y.push(ASIGNACION[f.asignacion]);
  }
  return { AND: y.filter((w) => Object.keys(w).length > 0) };
}

/** Lineas vigentes que tiene una persona: las de su celular y las suyas (eSIM, telefono personal). */
export function lineasDePersona(empleadoId: string) {
  return prisma.lineaTelefonica.findMany({
    where: {
      estado: { deBaja: false },
      OR: [{ activoId: null, empleadoId }, { activo: { empleadoActualId: empleadoId } }],
    },
    select: {
      id: true,
      numero: true,
      tipoChip: { select: { nombre: true, sinCelular: true } },
      activo: { select: { id: true, marca: NOMBRE, modelo: true } },
    },
    orderBy: { numero: 'asc' },
  });
}

const PARA_SOLICITUD = {
  id: true,
  numero: true,
  tipoChip: { select: { nombre: true, sinCelular: true } },
  operador: { select: { nombre: true } },
  activo: { select: { id: true, marca: NOMBRE, modelo: true } },
} satisfies Prisma.LineaTelefonicaSelect;

/** Las lineas con esos ids, en el mismo orden (las de un Cambio de equipo, SPEC 2.143). */
export async function lineasPorId(ids: string[]) {
  if (ids.length === 0) return [];
  const filas = await prisma.lineaTelefonica.findMany({ where: { id: { in: ids } }, select: PARA_SOLICITUD });
  const porId = new Map(filas.map((l) => [l.id, l]));
  return ids.map((id) => porId.get(id) ?? null);
}

/** Lineas vigentes que estan en esos equipos (las que vuelven con un celular devuelto). */
export function lineasDeEquipos(activoIds: string[], db: Pick<Prisma.TransactionClient, 'lineaTelefonica'> = prisma) {
  if (activoIds.length === 0) return Promise.resolve([]);
  return db.lineaTelefonica.findMany({
    where: { activoId: { in: activoIds }, estado: { deBaja: false } },
    select: PARA_SOLICITUD,
    orderBy: { numero: 'asc' },
  });
}

/**
 * Lineas que entrego una solicitud (SPEC 2.143): las que se le asociaron al crearla
 * (quedan en su tenencia con el detalle "Onboarding - N°" o "Cambio de equipo - N°")
 * y las que ya traian los celulares entregados.
 */
export async function lineasDeSolicitud(numero: string, activoIds: string[]) {
  const detalles = [`Onboarding - ${numero}`, `Cambio de equipo - ${numero}`];
  return prisma.lineaTelefonica.findMany({
    where: {
      OR: [
        { activoId: { in: activoIds } },
        { tenencias: { some: { origen: 'reasignacion', detalle: { in: detalles } } } },
      ],
    },
    select: PARA_SOLICITUD,
    orderBy: { numero: 'asc' },
  });
}
