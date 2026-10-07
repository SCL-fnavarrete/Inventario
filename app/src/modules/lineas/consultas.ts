import type { Prisma } from '@prisma/client';
import { filtroSede } from '@/shared/sedes/filtro';
import { SIN_DATO_LINEA, type FiltrosLineas } from '@/modules/lineas/filtros';

/**
 * Los filtros de Activos > Lineas como consulta (SPEC 2.131). La lista, las
 * tarjetas y las tablas usan esta misma funcion, asi cuentan lo mismo.
 */

// Tiene persona: la que tiene su celular o, sin celular, la guardada en la linea.
const CON_PERSONA: Prisma.LineaTelefonicaWhereInput = {
  OR: [{ activo: { empleadoActualId: { not: null } } }, { activoId: null, empleadoId: { not: null } }],
};
const PERSONA_DESVINCULADA: Prisma.LineaTelefonicaWhereInput = {
  OR: [
    { activo: { empleadoActual: { estado: 'desvinculado' } } },
    { activoId: null, empleado: { estado: 'desvinculado' } },
  ],
};
/** Vigente, pero en un celular de baja o vendido, o con alguien que ya se fue: se paga sin uso. */
export const LINEA_PARA_REVISAR: Prisma.LineaTelefonicaWhereInput = {
  estado: { deBaja: false },
  OR: [{ activo: { estado: { in: ['baja', 'vendido'] } } }, PERSONA_DESVINCULADA],
};

const ASIGNACION: Record<string, Prisma.LineaTelefonicaWhereInput> = {
  con: CON_PERSONA,
  sin: { NOT: CON_PERSONA },
  desvinculada: PERSONA_DESVINCULADA,
};

/** Sin estado, todas. Un estado del catalogo por id; "vigentes" y "baja" agrupan (los usan las tarjetas). */
function porEstado(estado?: string): Prisma.LineaTelefonicaWhereInput {
  if (!estado || estado === 'todas') return {};
  if (estado === 'vigentes') return { estado: { deBaja: false } };
  if (estado === 'baja') return { estado: { deBaja: true } };
  return { estadoId: estado };
}

/** Un catalogo por id, o los que no lo tienen. */
const porId = (campo: 'planId' | 'tipoChipId' | 'operadorId' | 'sedeId', valor?: string): Prisma.LineaTelefonicaWhereInput =>
  !valor ? {} : { [campo]: valor === SIN_DATO_LINEA ? null : valor };

/** "+56 9 1234 5678" busca por numero; un texto, por persona, plan, operador, celular... */
function busqueda(q?: string): Prisma.LineaTelefonicaWhereInput {
  const texto = q?.trim();
  if (!texto) return {};
  const c = { contains: texto, mode: 'insensitive' as const };
  const digitos = /^[\d\s+()-]+$/.test(texto) ? texto.replace(/\D/g, '') : '';
  return {
    OR: [
      ...(digitos ? [{ numero: { contains: digitos } }] : []),
      { plan: { nombre: c } },
      { responsable: c },
      { observaciones: c },
      { sede: { nombre: c } },
      { empleado: { OR: [{ nombres: c }, { apellidoPaterno: c }, { rut: c }] } },
      { activo: { OR: [{ imei: c }, { modelo: c }] } },
      { activo: { empleadoActual: { OR: [{ nombres: c }, { apellidoPaterno: c }, { rut: c }] } } },
      { tipoChip: { nombre: c } },
      { operador: { nombre: c } },
    ],
  };
}

/**
 * Los filtros como consulta. Con `sinTarjeta`, sin estado, asignacion ni
 * "para revisar": es la base de las tarjetas de cantidad, que cuentan cada uno
 * de esos grupos (si no, al elegir una tarjeta las demas quedarian en cero).
 */
export function whereFiltrosLineas(f: FiltrosLineas, { sinTarjeta = false } = {}): Prisma.LineaTelefonicaWhereInput {
  const y: Prisma.LineaTelefonicaWhereInput[] = [
    filtroSede(f.sedeId),
    porId('planId', f.plan),
    porId('tipoChipId', f.tipoChip),
    porId('operadorId', f.operador),
    // La sede del filtro se suma a la del navbar.
    porId('sedeId', f.sede),
    busqueda(f.q),
  ];
  if (!sinTarjeta) {
    y.push(f.revisar ? LINEA_PARA_REVISAR : porEstado(f.estado));
    if (f.asignacion) y.push(ASIGNACION[f.asignacion]);
  }
  return { AND: y.filter((w) => Object.keys(w).length > 0) };
}
