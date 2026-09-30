/** Pesos chilenos, sin decimales (SPEC 2.124). */
export const VALOR_MAXIMO_CLP = 999_999_999;

/** "$850.000"; "—" sin valor. */
export function formatearClp(valor: number | null | undefined): string {
  if (valor === null || valor === undefined) return '—';
  return `$${valor.toLocaleString('es-CL')}`;
}

/**
 * Lee un monto escrito a mano: "850000", "850.000" o "$ 850.000" -> 850000.
 * "" -> null. Lo que no sea un entero queda NaN, para que la validacion lo
 * rechace.
 */
export function leerClp(texto: string | number | null | undefined): number | null {
  if (texto === null || texto === undefined) return null;
  if (typeof texto === 'number') return texto;
  const limpio = texto.replace(/[$.\s]/g, '');
  if (limpio === '') return null;
  return /^\d+$/.test(limpio) ? Number(limpio) : NaN;
}
