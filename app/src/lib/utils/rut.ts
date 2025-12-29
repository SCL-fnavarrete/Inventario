/**
 * Utilidades para manejo de RUT chileno
 */

/**
 * Normaliza un RUT removiendo puntos, guiones y espacios
 * "12.345.678-9" → "123456789"
 * "12345678-9" → "123456789"
 */
export function normalizeRut(rut: string): string {
  if (!rut) return "";
  return rut.replace(/[\.\-\s]/g, "").toLowerCase();
}

/**
 * Formatea un RUT al formato estándar chileno
 * "123456789" → "12.345.678-9"
 */
export function formatRut(rut: string): string {
  const clean = normalizeRut(rut);
  if (clean.length < 2) return clean;

  const dv = clean.slice(-1);
  const numero = clean.slice(0, -1);
  const formatted = numero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${formatted}-${dv}`;
}

/**
 * Verifica si un string parece ser un RUT (contiene números)
 */
export function looksLikeRut(value: string): boolean {
  return /\d/.test(value);
}
