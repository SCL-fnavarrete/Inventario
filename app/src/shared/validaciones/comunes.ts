import { z } from "zod";

/**
 * Piezas de validacion que se repiten en varios esquemas (auditoria
 * 28-sep-2026, 7.B). Un numero o un texto sin tope llegaba hasta la base:
 * un entero enorme se pasaba del `int` de Postgres (500) y un texto de
 * megabytes se guardaba tal cual.
 */

/** Tope de cantidades y stock: holgado para el uso real, lejos del `int` de Postgres. */
export const MAX_CANTIDAD = 1_000_000;

/** Entero entre `min` y MAX_CANTIDAD (acepta "5" de un formulario). */
export const cantidad = (min: number, mensajeMinimo: string) =>
  z.coerce
    .number()
    .int("Debe ser un número entero")
    .min(min, mensajeMinimo)
    .max(MAX_CANTIDAD, "Máximo 1.000.000");

/** Texto libre opcional (observaciones, motivos) con largo maximo y sin espacios de relleno. */
export const textoLibre = (max = 2000) =>
  z.string().trim().max(max, `Máximo ${max.toLocaleString("es-CL")} caracteres`).optional().nullable();

/** Fecha opcional en texto (YYYY-MM-DD o ISO): si viene, tiene que ser una fecha real. */
export const fechaTextoOpcional = z
  .string()
  .refine((v) => v === "" || !Number.isNaN(Date.parse(v)), "Fecha inválida")
  .optional()
  .nullable();
