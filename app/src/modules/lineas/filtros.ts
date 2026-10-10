/**
 * Filtros de Activos > Lineas (SPEC 2.131): se combinan entre si y con la sede
 * del navbar. Los lee de la URL la pantalla y el servidor, asi la lista, las
 * tarjetas y las tablas cuentan lo mismo. Es puro.
 */

/** Busca las lineas que no tienen ese dato ("Sin operador"...). */
export const SIN_DATO_LINEA = 'sin_dato';

/** Estado: el id de un estado del catalogo (sin dato, todas). Los grupos los usan las tarjetas. */
export const ESTADO_LINEA_GRUPOS = { vigentes: 'Vigentes', baja: 'De baja', todas: 'Todas' } as const;

export const ASIGNACION_LINEA = {
  con: 'Con persona',
  sin: 'Disponible',
} as const;
export type AsignacionLinea = keyof typeof ASIGNACION_LINEA;

/**
 * Filtros de catalogo: el valor es el id de la opcion, o SIN_DATO_LINEA.
 */
export const FILTROS_CATALOGO_LINEA = [
  { param: 'tipoChip', etiqueta: 'Tipo de chip', endpoint: '/api/lineas/catalogos/tipos-chip', sinDato: 'Sin indicar' },
  { param: 'operador', etiqueta: 'Operador', endpoint: '/api/lineas/catalogos/operadores', sinDato: 'Sin operador' },
  // Solo las de baja tienen motivo; "Baja sin motivo" son las dadas de baja antes de que se pidiera (SPEC 2.140).
  { param: 'motivoBaja', etiqueta: 'Motivo de baja', endpoint: '/api/lineas/catalogos/motivos-baja', sinDato: 'Baja sin motivo' },
] as const;
export type ParamCatalogoLinea = (typeof FILTROS_CATALOGO_LINEA)[number]['param'];

export type FiltrosLineas = Partial<Record<ParamCatalogoLinea, string>> & {
  estado?: string;
  asignacion?: AsignacionLinea;
  q?: string;
  /** Sede del navbar: la del celular o, sin celular, la de la persona. */
  sedeId?: string;
};

/** Parametros de la URL que son filtros (los demas se ignoran). */
export const PARAMS_FILTRO_LINEA = ['estado', 'asignacion', 'q', ...FILTROS_CATALOGO_LINEA.map((f) => f.param)] as const;

/** Los filtros de la URL, sin vacios y con tope de largo. */
export function leerFiltrosLineas(sp: URLSearchParams): FiltrosLineas {
  const leer = (k: string) => sp.get(k)?.trim().slice(0, 100) || undefined;
  const asignacion = leer('asignacion');
  const f: FiltrosLineas = {
    estado: leer('estado'),
    asignacion: asignacion && asignacion in ASIGNACION_LINEA ? (asignacion as AsignacionLinea) : undefined,
    q: leer('q'),
    sedeId: leer('sedeId'),
  };
  for (const { param } of FILTROS_CATALOGO_LINEA) f[param] = leer(param);
  return Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined)) as FiltrosLineas;
}
