/**
 * Utilidades de comparacion de texto para busquedas "en memoria": permiten
 * que el usuario encuentre un registro sin importar acentos ni
 * mayusculas/minusculas. Compartidas entre rutas que necesitan el mismo
 * criterio de busqueda.
 */

/**
 * Quita acentos/diacriticos de un string.
 * "César" -> "cesar", "González" -> "gonzalez"
 */
// Construido con codigos de caracter para evitar problemas de encoding
// con el literal equivalente. Rango Unicode "Combining Diacritical Marks".
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
