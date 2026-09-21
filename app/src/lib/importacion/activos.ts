/**
 * Vocabulario de los Excel de inventario traducido al dominio del sistema.
 *
 * La columna "Estado" de los Excel no siempre contiene un estado: en la
 * mayoria de los archivos trae la condicion fisica (Usado / Nuevo /
 * Seminuevo) y el estado real se deduce de si la fila trae RUT. Solo un
 * archivo usa esa columna con su significado literal.
 *
 * Un valor no reconocido se informa como error; nunca se asume un estado
 * por defecto.
 */
import type { CondicionActivo, EstadoActivo } from "@prisma/client";
import { formatearRut, limpiarRut, validarDigitoVerificador } from "@/lib/validations/rut";
import { tieneVisibilidadTotal } from "@/lib/auth/sedeScope";
import type { SesionAutenticada } from "@/lib/auth/guard";

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
  no_devuelto: "no devuelto",
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

/**
 * Palabras del Excel en texto legible, para los mensajes de error de la
 * importacion. Se derivan de los Records tipados contra los enums (no de una
 * lista escrita a mano) para que agregar un estado al enum actualice el
 * mensaje automaticamente.
 */
function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

export const ESTADOS_RECONOCIDOS: string[] =
  Object.values(PALABRA_CANONICA_ESTADO).map(capitalizar);

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


/**
 * Activo existente minimo necesario para armar el mensaje de "numero de
 * serie duplicado" durante la importacion.
 */
export interface ActivoDuplicado {
  marca: string;
  modelo: string;
  sedeId: string | null;
  empleadoActual: { nombres: string; apellidoPaterno: string; rut: string | null } | null;
}

/**
 * Mensaje de "numero de serie duplicado" para la importacion de activos.
 *
 * numeroSerie es unico a nivel global, no por sede, asi que el chequeo mira
 * todas las sedes. El nivel de detalle del mensaje (nombre/RUT del empleado
 * asignado) se limita segun visibilidad del usuario, para no filtrar datos
 * de otra sede.
 */
export function mensajeSerieDuplicada(
  session: SesionAutenticada,
  numeroSerie: string,
  existingAsset: ActivoDuplicado | null
): string {
  if (!existingAsset) {
    return `N° de serie "${numeroSerie}" ya existe`;
  }

  const puedeVerDetalle =
    tieneVisibilidadTotal(session) || existingAsset.sedeId === session.user.sedeId;

  if (!puedeVerDetalle) {
    return `N° de serie "${numeroSerie}" ya existe en el sistema (registrado en otra sede)`;
  }

  const asignadoA = existingAsset.empleadoActual
    ? `${existingAsset.empleadoActual.nombres} ${existingAsset.empleadoActual.apellidoPaterno} (RUT: ${existingAsset.empleadoActual.rut})`
    : "Sin asignar";

  return `N° de serie "${numeroSerie}" ya existe - Marca: ${existingAsset.marca}, Modelo: ${existingAsset.modelo}, Asignado a: ${asignadoA}`;
}
/**
 * Sede real (id/nombre/codigo) para el mapa de resolucion por columna.
 */
export interface SedeReferencia {
  id: string;
  nombre: string;
  codigo: string;
}

/**
 * Arma el mapa "texto normalizado -> Sede.id" a partir de las sedes reales
 * de la base (nombre y codigo). No incluye apodos: la columna "Sede" es un
 * dato controlado, debe escribirse tal como aparece en Configuracion > Sedes.
 * Se arma en vivo para reconocer sedes nuevas sin cambios de codigo.
 */
export function construirMapaSedes(sedes: SedeReferencia[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const sede of sedes) {
    mapa[clave(sede.nombre)] = sede.id;
    mapa[clave(sede.codigo)] = sede.id;
  }
  return mapa;
}

/**
 * Sede que corresponde a una fila de importacion, leida de su propia
 * columna "Sede". La resolucion compara directo contra las sedes reales
 * (ver construirMapaSedes), sin geografia hardcodeada.
 *
 * Prioridad para quien tiene visibilidad total (admin):
 *   sede corregida a mano en esta fila > sede elegida para todo el archivo >
 *   deteccion automatica por la columna "Sede" de la fila. Si ninguna
 *   aplica, se informa el error -- nunca se adivina.
 *
 * Para un tecnico (amarrado a su sede sin excepcion): si la fila declara
 * explicitamente otra sede reconocida, se rechaza la fila en vez de
 * reetiquetarla en silencio. Si la columna viene vacia, no mapeada, o no
 * matchea ninguna sede real, se asume la sede propia del tecnico.
 */
export function resolverSedeParaFila(
  session: SesionAutenticada,
  opts: {
    sedeIdExplicita: string | null;
    mapaSedes: Record<string, string>;
    valorSede: string | null | undefined;
    sedeIdCorregida?: string | null;
  }
):
  | { sedeId: string }
  | { error: "sede_no_reconocida"; valorOriginal: string }
  | { error: "sede_ajena"; valorOriginal: string } {
  const valorNormalizado = clave(opts.valorSede ?? "");
  const sedeDetectada = valorNormalizado ? opts.mapaSedes[valorNormalizado] : undefined;

  if (!tieneVisibilidadTotal(session)) {
    if (sedeDetectada && sedeDetectada !== opts.sedeIdExplicita) {
      return { error: "sede_ajena", valorOriginal: opts.valorSede ?? "" };
    }
    // La sede propia del tecnico ya fue resuelta antes (o lanzo si no
    // tiene una asignada), nunca llega null aqui.
    return { sedeId: opts.sedeIdExplicita! };
  }

  if (opts.sedeIdCorregida) return { sedeId: opts.sedeIdCorregida };
  if (opts.sedeIdExplicita) return { sedeId: opts.sedeIdExplicita };

  if (!sedeDetectada) {
    return { error: "sede_no_reconocida", valorOriginal: opts.valorSede ?? "" };
  }
  return { sedeId: sedeDetectada };
}
