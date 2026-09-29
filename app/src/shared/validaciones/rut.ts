import { z } from "zod";

/**
 * Valida el dígito verificador de un RUT chileno
 * @param rut - RUT sin puntos ni guión, ej: "215233081"
 * @returns true si el dígito verificador es correcto
 */
export function validarDigitoVerificador(rut: string): boolean {
  // Limpiar el RUT de puntos y guiones
  const rutLimpio = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();

  if (rutLimpio.length < 2) return false;

  const cuerpo = rutLimpio.slice(0, -1);
  const digitoVerificador = rutLimpio.slice(-1);

  // Calcular dígito verificador
  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplo;
    multiplo = multiplo === 7 ? 2 : multiplo + 1;
  }

  const resto = suma % 11;
  const dvCalculado = 11 - resto;

  let dvEsperado: string;
  if (dvCalculado === 11) {
    dvEsperado = "0";
  } else if (dvCalculado === 10) {
    dvEsperado = "K";
  } else {
    dvEsperado = dvCalculado.toString();
  }

  return digitoVerificador === dvEsperado;
}

/**
 * Formatea un RUT al formato estándar chileno con puntos y guión
 * @param rut - RUT en cualquier formato
 * @returns RUT formateado: "21.523.308-1"
 */
export function formatearRut(rut: string): string {
  // Limpiar el RUT
  const rutLimpio = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();

  if (rutLimpio.length < 2) return rut;

  const cuerpo = rutLimpio.slice(0, -1);
  const dv = rutLimpio.slice(-1);

  // Agregar puntos cada 3 dígitos desde la derecha
  let cuerpoFormateado = "";
  for (let i = cuerpo.length - 1, j = 0; i >= 0; i--, j++) {
    if (j > 0 && j % 3 === 0) {
      cuerpoFormateado = "." + cuerpoFormateado;
    }
    cuerpoFormateado = cuerpo[i] + cuerpoFormateado;
  }

  return `${cuerpoFormateado}-${dv}`;
}

/**
 * Limpia un RUT removiendo puntos y guiones
 * @param rut - RUT en cualquier formato
 * @returns RUT sin puntos ni guiones: "215233081"
 */
export function limpiarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

// Expresión regular para validar formato de RUT chileno
const RUT_REGEX = /^(\d{1,2}\.?\d{3}\.?\d{3})-?([\dkK])$/;

// Schema Zod para RUT chileno
export const rutSchema = z
  .string()
  .min(1, "El RUT es requerido")
  .regex(RUT_REGEX, "Formato de RUT inválido (ej: 21.523.308-1)")
  .refine(validarDigitoVerificador, "RUT inválido - dígito verificador incorrecto")
  .transform(formatearRut);

// Schema Zod para RUT opcional
export const rutOptionalSchema = z
  .string()
  .optional()
  .nullable()
  .refine(
    (val) => !val || RUT_REGEX.test(val),
    "Formato de RUT inválido"
  )
  .refine(
    (val) => !val || validarDigitoVerificador(val),
    "RUT inválido - dígito verificador incorrecto"
  )
  .transform((val) => (val ? formatearRut(val) : val));
