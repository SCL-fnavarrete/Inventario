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
import { formatearRut, limpiarRut, validarDigitoVerificador } from "@/shared/validaciones/rut";

import {
  clave,
  parseEstado,
  parseCondicion,
  interpretarEstado,
  ESTADOS_RECONOCIDOS,
} from "@/modules/importacion/estadoCondicion";
import type { LecturaEstado } from "@/modules/importacion/estadoCondicion";

export { clave, parseEstado, parseCondicion, interpretarEstado, ESTADOS_RECONOCIDOS };
export type { LecturaEstado };

/**
 * El Excel dice "Activo" o "Asignado", pero la fila no trae persona (RUT ni
 * nombre): nadie lo tiene, asi que entra Disponible (SPEC 2.133). Antes quedaba
 * "asignado" sin dueno: ni disponible ni de alguien.
 */
export function asignadoSinPersona(lectura: LecturaEstado, tieneEmpleado: boolean): boolean {
  return lectura.tipo === "estado" && lectura.estado === "asignado" && !tieneEmpleado;
}

/**
 * El Excel dice "Disponible", pero la fila trae a una persona: los Excel no son
 * confiables, y si trae los datos de alguien el equipo es de esa persona (regla
 * de Javier, SPEC 2.133): entra Asignado, con su entrega.
 */
export function disponibleConPersona(lectura: LecturaEstado, tieneEmpleado: boolean): boolean {
  return lectura.tipo === "estado" && lectura.estado === "disponible" && tieneEmpleado;
}

/** Baja: estado final, que una persona en la fila no cambia. */
export function estadoFinal(lectura: LecturaEstado): boolean {
  return lectura.tipo === "estado" && lectura.estado === "baja";
}

/**
 * Estado final del activo (SPEC 2.133). Si la fila trae persona, el equipo es
 * suyo (Asignado, salvo que diga No devuelto o En mantencion); si no la trae,
 * nadie lo tiene ("Asignado" pasa a Disponible). Baja se respeta
 * (con persona la fila se detiene antes, ver procesarFila).
 */
export function resolverEstado(lectura: LecturaEstado, tieneEmpleado: boolean): EstadoActivo {
  if (asignadoSinPersona(lectura, tieneEmpleado)) return "disponible";
  if (disponibleConPersona(lectura, tieneEmpleado)) return "asignado";
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
  marca: { nombre: string };
  modelo: string;
  sedeId: string | null;
  empleadoActual: { nombres: string; apellidoPaterno: string; rut: string | null } | null;
}

/**
 * Mensaje de "numero de serie duplicado" para la importacion de activos.
 *
 * numeroSerie es unico a nivel global, no por sede, asi que el chequeo mira
 * todas las sedes.
 */
export function mensajeSerieDuplicada(numeroSerie: string, existingAsset: ActivoDuplicado | null): string {
  if (!existingAsset) {
    return `N° de serie "${numeroSerie}" ya existe`;
  }

  const asignadoA = existingAsset.empleadoActual
    ? `${existingAsset.empleadoActual.nombres} ${existingAsset.empleadoActual.apellidoPaterno} (RUT: ${existingAsset.empleadoActual.rut})`
    : "Sin asignar";

  return `N° de serie "${numeroSerie}" ya existe - Marca: ${existingAsset.marca.nombre}, Modelo: ${existingAsset.modelo}, Asignado a: ${asignadoA}`;
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
 * Prioridad:
 *   sede corregida a mano en esta fila > sede elegida para todo el archivo >
 *   deteccion automatica por la columna "Sede" de la fila. Una Sede vacia
 *   deja el equipo sin sede (SPEC 2.117: se completa despues en Editar); una
 *   escrita que no calza con ninguna se informa como error -- nunca se adivina. La corregida y la
 *   elegida para el archivo se validan contra las sedes reales antes de
 *   usarse (pueden venir de una preferencia guardada que apunte a una
 *   sede ya eliminada): si no existen, se informa el error igual que si
 *   la columna del Excel no matcheara ninguna sede.
 */
export function resolverSedeParaFila(
  opts: {
    sedeIdExplicita: string | null;
    mapaSedes: Record<string, string>;
    valorSede: string | null | undefined;
    sedeIdCorregida?: string | null;
  }
):
  | { sedeId: string | null }
  | { error: "sede_no_reconocida"; valorOriginal: string } {
  const valorNormalizado = clave(opts.valorSede ?? "");
  const sedeDetectada = valorNormalizado ? opts.mapaSedes[valorNormalizado] : undefined;
  // Ids de sedes que existen HOY en la base (mapaSedes se arma en vivo por
  // importacion). sedeIdExplicita/sedeIdCorregida pueden venir de una
  // preferencia guardada (sede del navbar) que quedo apuntando a una sede
  // ya eliminada; sin este chequeo llegaban intactos hasta el INSERT y
  // reventaban con un error crudo de foreign key en vez de este mensaje.
  const sedesVigentes = new Set(Object.values(opts.mapaSedes));

  if (opts.sedeIdCorregida) {
    if (!sedesVigentes.has(opts.sedeIdCorregida)) {
      return { error: "sede_no_reconocida", valorOriginal: "(sede corregida ya no existe)" };
    }
    return { sedeId: opts.sedeIdCorregida };
  }
  if (opts.sedeIdExplicita) {
    if (!sedesVigentes.has(opts.sedeIdExplicita)) {
      return { error: "sede_no_reconocida", valorOriginal: "(sede guardada ya no existe)" };
    }
    return { sedeId: opts.sedeIdExplicita };
  }

  if (!valorNormalizado) return { sedeId: null };
  if (!sedeDetectada) {
    return { error: "sede_no_reconocida", valorOriginal: opts.valorSede ?? "" };
  }
  return { sedeId: sedeDetectada };
}

/**
 * Referencia minima de una opcion de catalogo administrable (Sistema
 * Operativo, Antivirus, Licencia M365 -- ver Configuracion > Opciones de
 * Activos). Solo el nombre, que es lo unico que se compara.
 */
export interface CatalogoReferencia {
  nombre: string;
}

/**
 * Arma el mapa "texto normalizado -> nombre canonico" a partir de las
 * opciones reales del catalogo. Se arma en vivo (una vez por importacion,
 * no por fila) para reconocer opciones nuevas sin cambios de codigo.
 */
export function construirMapaCatalogo(opciones: CatalogoReferencia[]): Record<string, string> {
  const mapa: Record<string, string> = {};
  for (const opcion of opciones) {
    mapa[clave(opcion.nombre)] = opcion.nombre;
  }
  return mapa;
}

/**
 * Resuelve el valor de un campo respaldado por un catalogo administrable
 * (sistema operativo, antivirus, licencia M365) contra las opciones reales.
 *
 * Un valor vacio es valido (campo opcional, queda sin dato). Un valor que
 * no calza con ninguna opcion -- ni siquiera ignorando mayusculas/tildes --
 * nunca se guarda a ciegas: la fila queda para revision manual, donde se
 * elige una opcion existente o se crea una nueva en el catalogo. Asi el
 * texto que termina en el Activo siempre es, letra por letra, un nombre
 * real del catalogo, y el conteo "en uso" de cada opcion nunca queda en 0
 * por un desajuste de mayusculas o tildes.
 */
export function resolverValorCatalogo(
  valor: string,
  mapa: Record<string, string>
): { valor: string | null } | { error: "catalogo_no_reconocido"; valorOriginal: string } {
  const texto = valor.trim();
  if (!texto) return { valor: null };

  const encontrado = mapa[clave(texto)];
  if (encontrado) return { valor: encontrado };

  return { error: "catalogo_no_reconocido", valorOriginal: texto };
}
