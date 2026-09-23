/**
 * Interpretacion de "Estado" y "Condicion" del Excel de importacion:
 * texto libre (con o sin tildes/mayusculas) -> valor exacto del enum.
 *
 * Separado de activos.ts a proposito: este archivo no importa nada de
 * servidor (Prisma en runtime, auth, etc.), solo tipos y logica pura, para
 * poder usarlo tambien desde un componente de cliente (ErrorRowEditor) sin
 * arrastrar codigo que no le corresponde al navegador. activos.ts reexporta
 * todo esto para no duplicar la logica.
 */
import type { CondicionActivo, EstadoActivo } from "@prisma/client";

/** Normaliza un texto del Excel para compararlo: sin acentos, minusculas, un solo espacio. */
export function clave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Palabra canonica de cada estado del sistema.
 *
 * Es un Record sobre el enum de Prisma a proposito: si manana alguien agrega un
 * estado nuevo al schema, este objeto deja de compilar hasta que se decida con
 * que palabra del Excel se reconoce. Nada de estados que existen en la base pero
 * que ninguna importacion sabe leer.
 */
export const PALABRA_CANONICA_ESTADO: Record<EstadoActivo, string> = {
  disponible: "disponible",
  asignado: "asignado",
  en_mantencion: "en mantencion",
  baja: "baja",
  vendido: "vendido",
  no_devuelto: "no devuelto",
};

/** Idem para la condicion fisica. */
export const PALABRA_CANONICA_CONDICION: Record<CondicionActivo, string> = {
  nuevo: "nuevo",
  usado: "usado",
  danado: "danado",
};

/** Sinonimos vistos en los Excel reales, ademas de las palabras canonicas. */
const SINONIMOS_ESTADO: Record<string, EstadoActivo> = {
  activo: "asignado",
  "en uso": "asignado",
  entregado: "asignado",
  inactivo: "disponible",
  "sin asignar": "disponible",
  "en bodega": "disponible",
  stock: "disponible",
  mantencion: "en_mantencion",
  "en reparacion": "en_mantencion",
  "de baja": "baja",
  "dado de baja": "baja",
  "no devolvio": "no_devuelto",
  "no se devolvio": "no_devuelto",
  "sin devolver": "no_devuelto",
};

const SINONIMOS_CONDICION: Record<string, CondicionActivo> = {
  seminuevo: "usado",
  "semi nuevo": "usado",
  reacondicionado: "usado",
  "segunda mano": "usado",
  malo: "danado",
  "con danos": "danado",
  defectuoso: "danado",
};

const ESTADOS: Record<string, EstadoActivo> = { ...SINONIMOS_ESTADO };
for (const [estado, palabra] of Object.entries(PALABRA_CANONICA_ESTADO)) {
  ESTADOS[clave(palabra)] = estado as EstadoActivo;
}

const CONDICIONES: Record<string, CondicionActivo> = { ...SINONIMOS_CONDICION };
for (const [condicion, palabra] of Object.entries(PALABRA_CANONICA_CONDICION)) {
  CONDICIONES[clave(palabra)] = condicion as CondicionActivo;
}

export function parseEstado(valor: string | null | undefined): EstadoActivo | undefined {
  if (!valor) return undefined;
  return ESTADOS[clave(valor)];
}

export function parseCondicion(valor: string | null | undefined): CondicionActivo | undefined {
  if (!valor) return undefined;
  return CONDICIONES[clave(valor)];
}

/**
 * Que significa realmente lo que trae la columna mapeada como "estado".
 * `desconocido` es un resultado legitimo y la fila debe rechazarse: es preferible
 * que el usuario corrija una palabra a que la importacion invente un estado.
 */
export type LecturaEstado =
  | { tipo: "vacio" }
  | { tipo: "estado"; estado: EstadoActivo }
  | { tipo: "condicion"; condicion: CondicionActivo }
  | { tipo: "desconocido"; valor: string };

export function interpretarEstado(valor: string | null | undefined): LecturaEstado {
  const texto = (valor ?? "").trim();
  if (!texto) return { tipo: "vacio" };

  const estado = parseEstado(texto);
  if (estado) return { tipo: "estado", estado };

  const condicion = parseCondicion(texto);
  if (condicion) return { tipo: "condicion", condicion };

  return { tipo: "desconocido", valor: texto };
}

/**
 * Palabras del Excel en texto legible, para los mensajes de error de la
 * importacion. Se derivan del Record tipado contra el enum (no de una lista
 * escrita a mano) para que agregar un estado al enum actualice el mensaje
 * automaticamente.
 */
function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const ESTADOS_RECONOCIDOS: string[] =
  Object.values(PALABRA_CANONICA_ESTADO).map(capitalizar);
