/**
 * Utilidades de comparacion de texto para busquedas "en memoria" (ver
 * /api/empleados, seccion de busqueda): permiten que el usuario encuentre un
 * registro sin importar acentos ni mayusculas/minusculas.
 *
 * Se extrajeron de /api/empleados/route.ts (11-sep-2026) para poder
 * reutilizarlas en /api/asignaciones -- su filtro de busqueda por RUT no
 * funcionaba porque comparaba el termino escrito directo contra
 * `employee.rut`, que se guarda formateado ("12.345.678-9"): un RUT escrito
 * sin puntos ("123456789" o "12345678-9") nunca hacia match. La solucion ya
 * existia para Empleados (normalizar con `normalizeRut` de @/lib/utils/rut);
 * lo que faltaba compartir era esto.
 */

/**
 * Quita acentos/diacriticos de un string.
 * "César" -> "cesar", "González" -> "gonzalez"
 */
// Construido con codigos de caracter en vez del literal /[̀-ͯ]/g
// (equivalente) para evitar arrastrar un problema de encoding de herramienta
// al escribir este archivo. Rango Unicode "Combining Diacritical Marks".
const COMBINING_DIACRITICS = new RegExp(String.fromCharCode(91, 0x0300, 45, 0x036f, 93), "g");

export function removeAccents(str: string): string {
  return str.normalize("NFD").replace(COMBINING_DIACRITICS, "").toLowerCase();
}

/**
 * Compara un campo contra un termino de busqueda, ambos sin acentos.
 */
export function matchNoAccent(field: string | null | undefined, searchTermNoAccent: string): boolean {
  if (!field) return false;
  return removeAccents(field).includes(searchTermNoAccent);
}
