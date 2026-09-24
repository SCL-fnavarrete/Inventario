import { normalizeRut } from "@/lib/utils/rut";

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
 * Busqueda por palabras: cada palabra del termino debe aparecer en alguno de
 * los campos (no necesariamente el mismo), sin distinguir acentos ni
 * mayusculas. Asi "juan perez" encuentra a nombres="Juan" y
 * apellidoPaterno="Pérez"; comparar el termino entero contra cada campo por
 * separado no lo encontraba.
 */
export function coincidePorPalabras(
  termino: string,
  campos: (string | null | undefined)[]
): boolean {
  const palabras = removeAccents(termino).split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return true;
  const textos = campos.filter((c): c is string => !!c).map(removeAccents);
  return palabras.every((palabra) => textos.some((texto) => texto.includes(palabra)));
}

/**
 * Criterio comun de las busquedas en memoria (Solicitudes, Personal,
 * Asignaciones): el termino calza con el RUT, sin puntos ni guion, o palabra
 * por palabra con los campos de texto. El RUT solo se compara si el termino
 * tiene algun digito: una letra suelta como "k" no debe calzar con todo RUT
 * terminado en K.
 */
export function coincideBusqueda(
  termino: string,
  datos: { rut?: string | null; campos: (string | null | undefined)[] }
): boolean {
  if (datos.rut && /\d/.test(termino)) {
    const buscado = normalizeRut(termino);
    if (buscado && normalizeRut(datos.rut).includes(buscado)) return true;
  }
  return coincidePorPalabras(termino, datos.campos);
}

/**
 * Un correo con forma valida ("algo@dominio.cl"). La misma regla en todos los
 * formularios: antes estaba copiada en Onboarding y Editar empleado.
 */
export function esCorreoValido(correo: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
}
