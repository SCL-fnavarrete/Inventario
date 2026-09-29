import { Prisma } from '@prisma/client';
import { estadoActivoEnum } from '@/modules/activos/validaciones';
import { whereActivosPorLlegar } from '@/modules/despachos/consultas';
import { filtroSede } from '@/shared/sedes/filtro';
import { FILTROS_DATO, SIN_DATO, type FiltrosDato, type ParamFiltroDato } from '@/modules/activos/filtros';

/**
 * Filtro de activos vigentes.
 *
 * Un activo con `deletedAt` es un registro descartado (tipicamente un
 * duplicado dejado por una importacion) y no debe aparecer en listados,
 * busquedas, reportes ni estadisticas. Su ficha y su historial siguen
 * accesibles por id: se oculta el registro, no la evidencia.
 *
 * Se usa como fragmento en el `where`:
 *
 *   prisma.asset.findMany({ where: { ...ACTIVOS_VIGENTES, estado } })
 *
 * No se aplica en la importacion (necesita ver los descartados para
 * detectar numeros de serie ya ocupados) ni en utilidades de mantenimiento
 * de la base que cuentan filas reales.
 */
export const ACTIVOS_VIGENTES = { deletedAt: null } satisfies Prisma.AssetWhereInput;

/**
 * Filtros de la lista de Activos, que la exportacion a Excel repite tal cual
 * (asi el archivo trae lo mismo que se ve en pantalla):
 * - vigentes de la sede elegida en el menu, o de todas (SPEC 2.117); o, con
 *   `porLlegar`, los que vienen en camino a esa sede (SPEC 2.108), que
 *   todavia son de la sede de origen;
 * - estado (uno desconocido, de una URL editada a mano, se ignora) y categoria;
 * - busqueda por palabras y datos de catalogo (marca, sistema operativo,
 *   antivirus, licencia, motivo de baja; SPEC 2.116.6), todos con AND.
 */
export type FiltrosActivos = {
  estado?: string;
  categoriaId?: string;
  sedeIdFiltro?: string;
  porLlegar?: boolean;
  search?: string;
  datos?: FiltrosDato;
};

export function whereFiltrosActivos(f: FiltrosActivos): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = f.porLlegar
    ? whereActivosPorLlegar(f.sedeIdFiltro || null)
    : { ...ACTIVOS_VIGENTES, ...filtroSede(f.sedeIdFiltro) };
  const estado = estadoActivoEnum.safeParse(f.estado);
  if (estado.success) where.estado = estado.data;
  if (f.categoriaId) where.categoriaId = f.categoriaId;

  const y = [
    ...palabrasDeBusqueda(f.search ?? '').map(busquedaActivo),
    ...FILTROS_DATO.flatMap(({ param }) => {
      const valor = f.datos?.[param];
      return valor ? [condicionFiltroDato(param, valor)] : [];
    }),
  ];
  if (y.length) where.AND = y;
  return where;
}

// Campo del activo de cada filtro por dato (el motivo de baja vive en la mantencion).
const CAMPO_FILTRO = {
  marca: 'marca',
  so: 'sistemaOperativo',
  antivirus: 'antivirus',
  licencia: 'tipoLicenciaMicrosoft365',
} as const;

/** Condicion de un filtro por dato; SIN_DATO busca los que no lo tienen. */
function condicionFiltroDato(param: ParamFiltroDato, valor: string): Prisma.AssetWhereInput {
  if (param === 'motivoBaja') {
    return valor === SIN_DATO
      ? { estado: 'baja', maintenances: { none: { motivoBajaId: { not: null } } } }
      : { maintenances: { some: { motivoBajaId: valor } } };
  }
  const campo = CAMPO_FILTRO[param];
  return valor === SIN_DATO ? { OR: [{ [campo]: null }, { [campo]: '' }] } : { [campo]: valor };
}

/** Filtros de la lista leidos de la URL: la lista, el Excel y las tarjetas leen lo mismo. */
export function leerFiltrosActivos(sp: URLSearchParams): FiltrosActivos {
  const datos: FiltrosDato = {};
  for (const { param } of FILTROS_DATO) {
    const valor = sp.get(param)?.trim();
    if (valor) datos[param] = valor.slice(0, 100);
  }
  return {
    estado: sp.get('estado') || '',
    categoriaId: sp.get('categoriaId') || '',
    sedeIdFiltro: sp.get('sedeId') || '',
    porLlegar: sp.get('porLlegar') === '1',
    search: (sp.get('search') || '').slice(0, 200),
    datos,
  };
}

/** Palabras de un termino de busqueda, sin espacios de sobra. */
export function palabrasDeBusqueda(termino: string): string[] {
  return termino.trim().split(/\s+/).filter(Boolean);
}

/**
 * Condicion de busqueda de UNA palabra sobre un activo: debe aparecer en
 * alguno de sus datos o en los de la persona que lo tiene. Se combina con
 * AND por palabra, asi "lenovo perez" encuentra el Lenovo de Pérez aunque
 * esten en campos distintos. La comparten Activos y Mantenciones, que antes
 * tenian cada una su propia lista (Activos no buscaba por persona).
 */
export function busquedaActivo(palabra: string): Prisma.AssetWhereInput {
  const c = { contains: palabra, mode: 'insensitive' as const };
  return {
    OR: [
      { numeroSerie: c },
      { imei: c },
      { marca: c },
      { modelo: c },
      { nombreEquipo: c },
      { numeroTelefono: c },
      { ubicacionFisica: c },
      { categoria: { nombre: c } },
      { empleadoActual: { nombres: c } },
      { empleadoActual: { apellidoPaterno: c } },
      { empleadoActual: { apellidoMaterno: c } },
      { empleadoActual: { rut: c } },
      { empleadoActual: { correoEmpresa: c } },
    ],
  };
}
