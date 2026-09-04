/**
 * Utilidades de presentacion y busqueda de RUT.
 *
 * La logica real (limpiar, formatear, validar el digito verificador) vive en
 * @/lib/validations/rut. Este modulo solo reexporta con los nombres que ya usa
 * la interfaz. Antes tenia su propia implementacion, que ademas pasaba el RUT a
 * minusculas mientras la otra lo pasaba a mayusculas: dos RUT terminados en K
 * se normalizaban distinto segun por donde entraran.
 */
import { formatearRut, limpiarRut } from "@/lib/validations/rut";

/**
 * Normaliza un RUT para comparar o buscar: sin puntos, guiones ni espacios.
 * "12.345.678-9" -> "123456789"
 */
export function normalizeRut(rut: string): string {
  if (!rut) return "";
  return limpiarRut(rut.replace(/\s/g, ""));
}

/**
 * Formatea un RUT al estandar chileno: "123456789" -> "12.345.678-9"
 */
export function formatRut(rut: string): string {
  if (!rut) return "";
  return formatearRut(normalizeRut(rut));
}

/**
 * Verifica si un string parece ser un RUT (contiene numeros)
 */
export function looksLikeRut(value: string): boolean {
  return /\d/.test(value);
}
