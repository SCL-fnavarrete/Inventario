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
 * Las palabras que el Excel puede traer, en texto legible, para los mensajes
 * de error de la importacion.
 *
 * Se derivan de los mismos Records tipados contra los enums de arriba, no de
 * una lista escrita a mano: el 20-sep-2026 se agrego el estado "no devuelto"
 * (SPEC 2.57) y el mensaje de error siguio ofreciendo los cinco estados
 * viejos, de modo que le decia al usuario que su valor no era valido y acto
 * seguido le escondia la palabra que si habria servido. Derivandolo, agregar
 * un estado al enum actualiza el mensaje solo.
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
 * 18-sep-2026: numeroSerie es unico a nivel global (no por sede -- un mismo
 * equipo fisico no deberia repetirse en ninguna sede), asi que el chequeo de
 * duplicado en si tiene que seguir mirando todas las sedes. El problema
 * encontrado en la ronda de pruebas de Importacion de Activos era el detalle
 * del mensaje: revelaba nombre y RUT del empleado al que esta asignado el
 * activo existente sin importar su sede -- si un tecnico de Santiago subia
 * un Excel con un numero de serie que en realidad es de un equipo de
 * Concepcion, veia el nombre y RUT de un empleado de Concepcion. Mismo tipo
 * de fuga que F-4 de la auditoria de seguridad, pero en el flujo de
 * importacion. Se usa el mismo criterio que el resto de la app
 * (tieneVisibilidadTotal / sede propia) para decidir cuanto detalle mostrar.
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
 * de la base (nombre y codigo). Deliberadamente no incluye apodos ("Bodega
 * Santiago", etc.): la columna "Sede" es un dato controlado -- se le pide a
 * quien llena la planilla (soporte TI) que escriba el nombre tal como
 * aparece en Configuracion > Sedes, no que se adivinen variantes. Se arma en
 * vivo, consultando la base en cada importacion, para que una sede creada
 * hoy se reconozca manana sin tocar codigo.
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
 * columna "Sede" (SPEC 2.30, 19-sep-2026).
 *
 * Historia: se evaluo primero detectar la sede a partir de la comuna
 * (tabla de 346 comunas de Chile + reglas de region). Se descarto porque la
 * ambiguedad estaba en el dato de origen, no en la logica -- la solucion de
 * fondo es que la planilla declare la sede explicitamente, no que el
 * sistema la adivine. Con la sede como columna propia, la resolucion es
 * una comparacion directa contra las sedes reales (ver construirMapaSedes),
 * sin geografia hardcodeada ni mantencion cuando se crea una sede nueva.
 *
 * Prioridad para quien tiene visibilidad total (admin):
 *   sede corregida a mano en esta fila (reimportacion de una fila que fallo
 *   y que el usuario corrigio en el panel de errores) > sede elegida para
 *   todo el archivo > deteccion automatica por la columna "Sede" de la
 *   fila. Si ninguna aplica, se informa el error -- nunca se adivina.
 *
 * Para un tecnico (SPEC 2.29.1, amarrado a su sede sin excepcion): si la
 * fila declara EXPLICITAMENTE otra sede reconocida, se rechaza esa fila en
 * vez de reetiquetarla en silencio -- lo contrario dejaria un equipo de
 * otra sede registrado como si fuera de la suya, un dato incorrecto y no
 * solo un problema de permisos. Si la columna viene vacia, no mapeada, o
 * con un valor que no matchea ninguna sede real, se asume que la fila es de
 * su propia sede (mismo comportamiento que antes de esta funcionalidad,
 * para no romper archivos sin columna "Sede").
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
    // sedeIdParaCrear ya devolvio la sede propia del tecnico (o lanzo si no
    // tiene una asignada) -- nunca puede llegar null aqui.
    return { sedeId: opts.sedeIdExplicita! };
  }

  if (opts.sedeIdCorregida) return { sedeId: opts.sedeIdCorregida };
  if (opts.sedeIdExplicita) return { sedeId: opts.sedeIdExplicita };

  if (!sedeDetectada) {
    return { error: "sede_no_reconocida", valorOriginal: opts.valorSede ?? "" };
  }
  return { sedeId: sedeDetectada };
}
