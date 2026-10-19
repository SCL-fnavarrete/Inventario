import { limpiarRut } from '@/shared/validaciones/rut';

/**
 * Encontrar a una persona que ya existe (SPEC 2.133), para las importaciones:
 * primero por RUT y, si la fila no trae RUT, por nombre y apellidos. Es pura (sin
 * base de datos): la importacion carga las personas una vez y busca en memoria.
 */

export type PersonaIndexada = {
  id: string;
  rut: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  estado: 'activo' | 'desvinculado' | 'licencia';
  correoEmpresa: string | null;
  correoPersonal: string | null;
  cargo: string | null;
  jefatura: string | null;
  supervisor: string | null;
  ubicacion: string | null;
  /** Si la fila no trae sede, el equipo que queda con la persona toma la suya (SPEC 2.171). */
  sedeId: string | null;
};

export type ConsultaPersona = {
  rut?: string | null;
  nombres?: string | null;
  apellidoPaterno?: string | null;
  apellidoMaterno?: string | null;
};

export type ResultadoBusqueda =
  /** La persona existe: por RUT, o por nombre cuando la fila no trae RUT. */
  | { tipo: 'encontrada'; persona: PersonaIndexada; por: 'rut' | 'nombre' }
  /** Varias personas calzan con el nombre: no se elige una a ciegas. */
  | { tipo: 'ambigua'; candidatas: PersonaIndexada[] }
  /** El RUT es nuevo pero el nombre es de otra persona con otro RUT: posible duplicado. */
  | { tipo: 'duplicado'; persona: PersonaIndexada }
  | { tipo: 'no_existe' };

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y']);

const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Palabras del nombre, sin tildes ni particulas ("De La Parra" -> ["parra"]). */
export function palabrasDeNombre(texto: string | null | undefined): string[] {
  return sinTildes(texto ?? '')
    .split(/[^a-zñ]+/)
    .filter((p) => p.length > 1 && !PARTICULAS.has(p));
}

/** Letras que hay que cambiar para pasar de una palabra a la otra (Levenshtein). */
function distancia(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return d[a.length][b.length];
}

/** La misma palabra, o con una letra de diferencia si es larga ("Fritz" / "Friz"). */
const parecidas = (a: string, b: string) => a === b || (a.length >= 4 && b.length >= 4 && distancia(a, b) <= 1);

/** Todas las palabras de `buscadas` estan (parecidas) en `en`. */
const incluidas = (buscadas: string[], en: string[]) => buscadas.every((p) => en.some((q) => parecidas(p, q)));

/**
 * ¿Es la misma persona por nombre? El primer nombre y el apellido paterno tienen
 * que estar; el materno, solo si los dos lo tienen. Pide al menos nombre y apellido.
 */
export function mismoNombre(a: ConsultaPersona, b: ConsultaPersona): boolean {
  const nombreA = palabrasDeNombre(a.nombres)[0];
  const nombreB = palabrasDeNombre(b.nombres)[0];
  const paternoA = palabrasDeNombre(a.apellidoPaterno);
  const paternoB = palabrasDeNombre(b.apellidoPaterno);
  if (!nombreA || !nombreB || !paternoA.length || !paternoB.length) return false;
  if (!parecidas(nombreA, nombreB) || !incluidas(paternoA, paternoB)) return false;
  const maternoA = palabrasDeNombre(a.apellidoMaterno);
  const maternoB = palabrasDeNombre(b.apellidoMaterno);
  return !maternoA.length || !maternoB.length || incluidas(maternoA, maternoB);
}

/** Compara dos RUT sin puntos ni guion ni mayusculas. */
export const mismoRut = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && limpiarRut(a).toUpperCase() === limpiarRut(b).toUpperCase();

/**
 * Busca a la persona de una fila:
 * 1. Por RUT: si existe, es ella. Nunca se duplica.
 * 2. Sin RUT, por nombre y apellidos: si calza una sola, es ella; si calzan
 *    varias, es ambigua.
 * 3. Con un RUT nuevo cuyo nombre es de otra persona con otro RUT: posible duplicado.
 */
export function buscarPersona(indice: PersonaIndexada[], consulta: ConsultaPersona): ResultadoBusqueda {
  if (consulta.rut) {
    const porRut = indice.find((p) => mismoRut(p.rut, consulta.rut));
    if (porRut) return { tipo: 'encontrada', persona: porRut, por: 'rut' };
  }
  const porNombre = indice.filter((p) => mismoNombre(p, consulta));
  if (consulta.rut) {
    // Una persona creada antes sin RUT: ahora llega su RUT y se le completa.
    const sinRut = porNombre.filter((p) => !p.rut);
    if (sinRut.length === 1) return { tipo: 'encontrada', persona: sinRut[0], por: 'nombre' };
    // Una persona que ya tiene otro RUT no es la de esta fila: puede ser un duplicado o un RUT mal escrito.
    const conOtroRut = porNombre.find((p) => p.rut);
    return conOtroRut ? { tipo: 'duplicado', persona: conOtroRut } : { tipo: 'no_existe' };
  }
  if (porNombre.length === 1) return { tipo: 'encontrada', persona: porNombre[0], por: 'nombre' };
  if (porNombre.length > 1) return { tipo: 'ambigua', candidatas: porNombre };
  return { tipo: 'no_existe' };
}
