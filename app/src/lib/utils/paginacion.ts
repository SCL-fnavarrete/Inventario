/**
 * Paginacion saneada de los listados (auditoria 27-sep-2026, extras del
 * bloque 2). Un valor invalido o fuera de rango se corrige al limite en vez
 * de rechazar la peticion, para que el listado siempre responda algo
 * utilizable; y ningun `limit` pasa del tope de la ruta, para que nadie pida
 * `limit=1000000` y se traiga la tabla entera.
 */

/** Entero de un parametro de la URL, acotado a [minimo, maximo]. */
export function enteroEnRango(valor: string | null, pordefecto: number, minimo: number, maximo: number): number {
  const n = Number.parseInt(valor ?? "", 10);
  if (!Number.isFinite(n)) return pordefecto;
  return Math.min(Math.max(n, minimo), maximo);
}

/** `page` y `limit` de la URL, saneados. */
export function leerPaginacion(
  params: URLSearchParams,
  { limitPorDefecto = 10, limitMaximo = 100 }: { limitPorDefecto?: number; limitMaximo?: number } = {}
): { page: number; limit: number } {
  return {
    page: enteroEnRango(params.get("page"), 1, 1, Number.MAX_SAFE_INTEGER),
    limit: enteroEnRango(params.get("limit"), limitPorDefecto, 1, limitMaximo),
  };
}
