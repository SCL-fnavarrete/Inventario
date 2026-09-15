/**
 * Vocabulario de los Excel de inventario traducido al dominio del sistema.
 *
 * Existe por una razon concreta: la columna "Estado" de los Excel de SCL no
 * contiene estados. En seis de los siete archivos contiene la condicion fisica
 * (Usado / Nuevo / Seminuevo) y el estado real hay que deducirlo de si la fila
 * trae RUT. Solo "Notebook disponibles.xlsx" usa esa columna con su significado
 * literal (Asignado / Disponible / Mantencion) y, no por casualidad, es el unico
 * archivo que no tiene columna RUT.
 *
 * Antes esto se resolvia con un mapa que devolvia "disponible" para todo lo que
 * no reconocia. El efecto era que "Usado" se leia como "disponible", la fila
 * dejaba de procesar al empleado y la importacion terminaba en verde habiendo
 * perdido el empleado, la asignacion y la fecha de entrega de cada activo.
 *
 * La regla de aqui en adelante: lo que no se reconoce se informa, no se adivina.
 */
import type { CondicionActivo, EstadoActivo } from "@prisma/client";
import { formatearRut, limpiarRut, validarDigitoVerificador } from "@/lib/validations/rut";

/** Normaliza un texto del Excel para compararlo: sin acentos, minusculas, un solo espacio. */
function clave(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
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
const PALABRA_CANONICA_ESTADO: Record<EstadoActivo, string> = {
  disponible: "disponible",
  asignado: "asignado",
  en_mantencion: "en mantencion",
  baja: "baja",
  vendido: "vendido",
};

/** Idem para la condicion fisica. */
const PALABRA_CANONICA_CONDICION: Record<CondicionActivo, string> = {
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
 * Estado final del activo. El Excel manda cuando dice algo que es un estado;
 * si no, el estado se deduce de si el equipo esta en manos de alguien.
 */
export function resolverEstado(lectura: LecturaEstado, tieneEmpleado: boolean): EstadoActivo {
  if (lectura.tipo === "estado") return lectura.estado;
  return tieneEmpleado ? "asignado" : "disponible";
}

/**
 * Condicion final. Gana una columna "condicion" mapeada explicitamente; si no
 * existe, sirve la condicion que venia escondida en la columna "estado".
 */
export function resolverCondicion(
  lectura: LecturaEstado,
  valorColumnaCondicion?: string | null
): CondicionActivo {
  const explicita = parseCondicion(valorColumnaCondicion);
  if (explicita) return explicita;
  if (lectura.tipo === "condicion") return lectura.condicion;
  return "usado";
}

/**
 * La columna "Microsoft 365" de los Excel no trae SI/NO: trae el nombre del plan
 * ("Premium" en 388 filas) o viene vacia. Leerla como booleano estricto convertia
 * todas esas licencias en false.
 */
const NEGATIVOS_MICROSOFT: ReadonlySet<string> = new Set([
  "no", "0", "false", "sin", "sin licencia", "ninguno", "n/a", "na", "-", "--",
]);

export function tieneMicrosoft365(valor: string | null | undefined): boolean {
  const k = clave(valor ?? "");
  if (!k) return false;
  return !NEGATIVOS_MICROSOFT.has(k);
}

/**
 * RUT del Excel al formato que usa el resto de la aplicacion.
 *
 * Las rutas de importacion de activos guardaban el RUT sin puntos ni guion
 * ("197269715") mientras la interfaz lo guarda formateado ("19.726.971-5").
 * Como la busqueda del empleado es por igualdad exacta, un empleado creado a
 * mano nunca coincidia con el mismo empleado visto desde el Excel y terminaba
 * duplicado. Aqui hay un unico formato canonico: el formateado.
 */
export type LecturaRut =
  | { tipo: "vacio" }
  | { tipo: "valido"; rut: string }
  | { tipo: "invalido"; valor: string };

export function interpretarRut(valor: string | null | undefined): LecturaRut {
  const texto = (valor ?? "").trim();
  if (!texto) return { tipo: "vacio" };

  const limpio = limpiarRut(texto);
  if (limpio.length < 2 || !validarDigitoVerificador(limpio)) {
    return { tipo: "invalido", valor: texto };
  }

  return { tipo: "valido", rut: formatearRut(limpio) };
}
