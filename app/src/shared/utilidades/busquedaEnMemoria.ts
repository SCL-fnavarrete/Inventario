/**
 * Busqueda que se filtra en memoria (RUT sin formato y palabras sin acentos,
 * ver coincideBusqueda) sin traer todo el detalle (auditoria 28-sep-2026, 3.1).
 *
 * 1. La ruta trae SOLO las columnas de busqueda de las filas visibles.
 * 2. `paginarCoincidencias` filtra y corta la pagina: devuelve sus ids.
 * 3. La ruta trae con todas sus relaciones solo esos ids, y `ordenarComo`
 *    los deja en el orden original (un `IN` no lo garantiza).
 * Antes se traian todas las filas con todas sus relaciones para mostrar 10.
 */
export function paginarCoincidencias<T extends { id: string }>(
  candidatas: T[],
  coincide: (fila: T) => boolean,
  skip: number,
  take: number
): { total: number; ids: string[] } {
  const ids = candidatas.filter(coincide).map((c) => c.id);
  return { total: ids.length, ids: ids.slice(skip, skip + take) };
}

/** Filas en el mismo orden que `ids`. */
export function ordenarComo<T extends { id: string }>(ids: string[], filas: T[]): T[] {
  const porId = new Map(filas.map((f) => [f.id, f]));
  return ids.map((id) => porId.get(id)).filter((f): f is T => f !== undefined);
}
