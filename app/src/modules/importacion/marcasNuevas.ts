import { nombreDeMarca } from '@/modules/activos';
import type { Fallo } from './fallos';

/** Una marca que el Excel trae y el catalogo no tiene, con las filas que la usan. */
export interface MarcaNueva {
  /** Como se propone crearla (ya con el formato unico de marcas). */
  nombre: string;
  filas: number[];
}

/**
 * De los fallos de la revision, las marcas que faltan en el catalogo. "AOC",
 * "Aoc" y "aoc" son la misma marca: se juntan en una sola.
 */
export function marcasNuevasDeFallos(fallos: Fallo[]): MarcaNueva[] {
  const grupos = new Map<string, MarcaNueva>();
  for (const f of fallos) {
    if (!/marca no reconocida/i.test(f.mensaje)) continue;
    const original = f.mensaje.match(/"([^"]+)"/)?.[1];
    if (!original) continue;
    const clave = original.trim().toLowerCase();
    const g = grupos.get(clave) ?? { nombre: nombreDeMarca(original), filas: [] };
    g.filas.push(f.fila);
    grupos.set(clave, g);
  }
  return [...grupos.values()].sort((a, b) => b.filas.length - a.filas.length);
}
