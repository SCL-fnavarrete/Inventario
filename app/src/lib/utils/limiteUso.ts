import { ApiError } from "@/lib/errors";

/**
 * Limite de uso de las operaciones pesadas (exportar, PDF, importar), por
 * usuario (auditoria 28-sep-2026, 1.2). Antes se podian repetir en bucle y
 * saturar la CPU y la base.
 *
 * Cuenta en memoria, por instancia del servidor: en un servidor propio es un
 * tope exacto; en Vercel frena al que repite la operacion (sus peticiones
 * suelen caer en la misma instancia), pero no es un tope global. Para uno
 * global, reemplazar el Map por Upstash Ratelimit sin cambiar las llamadas.
 */

const usos = new Map<string, number[]>();

export const LIMITES = {
  exportar: { max: 5, ventanaMs: 60_000 },
  documento: { max: 30, ventanaMs: 60_000 },
  importarArchivo: { max: 20, ventanaMs: 60_000 },
  // 5.000 filas en tandas de 200 son 25 llamadas: 60 deja margen para reintentos.
  importarTanda: { max: 60, ventanaMs: 60_000 },
} as const;

/** Lanza 429 si `usuarioId` ya uso `accion` el maximo de veces en la ventana. */
export function exigirCupo(usuarioId: string, accion: keyof typeof LIMITES, ahora = Date.now()): void {
  const { max, ventanaMs } = LIMITES[accion];
  const clave = `${accion}:${usuarioId}`;
  const desde = ahora - ventanaMs;
  const recientes = (usos.get(clave) ?? []).filter((t) => t > desde);

  if (recientes.length >= max) {
    throw new ApiError(429, "Demasiadas solicitudes seguidas. Espera un minuto y vuelve a intentar.");
  }
  recientes.push(ahora);
  usos.set(clave, recientes);

  // Limpieza ocasional: el mapa no crece sin fin con usuarios inactivos.
  if (usos.size > 1000) {
    for (const [k, marcas] of usos) if (marcas.every((t) => t <= desde)) usos.delete(k);
  }
}
