import { z } from "zod";

/**
 * Condicion del cargador de un notebook al entregarlo o devolverlo
 * (Assignment.condicionCargadorEntrega / condicionCargadorDevolucion, enum
 * CondicionCargador en schema.prisma). Unico lugar con los valores y sus
 * etiquetas: formularios, validaciones y actas PDF salen de aca.
 */
export const CONDICIONES_CARGADOR = ["operativo", "con_danos", "no_incluido"] as const;

export type CondicionCargador = (typeof CONDICIONES_CARGADOR)[number];

export const CONDICION_CARGADOR_POR_DEFECTO: CondicionCargador = "operativo";

export const condicionCargadorSchema = z.enum(CONDICIONES_CARGADOR);

/** La tercera opcion se nombra distinto segun si el cargador sale o vuelve. */
export type ContextoCargador = "entrega" | "devolucion";

const ETIQUETAS: Record<CondicionCargador, Record<ContextoCargador, string>> = {
  operativo: { entrega: "Operativo", devolucion: "Operativo" },
  con_danos: { entrega: "Con daños", devolucion: "Con daños" },
  no_incluido: { entrega: "No incluido", devolucion: "No devuelto" },
};

function esCondicionCargador(valor: unknown): valor is CondicionCargador {
  return typeof valor === "string" && (CONDICIONES_CARGADOR as readonly string[]).includes(valor);
}

/** Etiqueta visible; null si no hay dato (equipo sin cargador) o no es valido. */
export function etiquetaCondicionCargador(
  valor: string | null | undefined,
  contexto: ContextoCargador
): string | null {
  return esCondicionCargador(valor) ? ETIQUETAS[valor][contexto] : null;
}

/** Opciones en orden para un <select>. */
export function opcionesCondicionCargador(contexto: ContextoCargador) {
  return CONDICIONES_CARGADOR.map((value) => ({ value, label: ETIQUETAS[value][contexto] }));
}
