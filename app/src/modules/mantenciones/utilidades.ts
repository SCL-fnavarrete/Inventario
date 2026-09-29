import { aValorInputDate, hoyISO } from '@/shared/utilidades/fechas';

/**
 * Reglas de mantenciones que usan tanto la API como las pantallas. Un solo
 * lugar para que la lista, el calendario y la baja no las calculen distinto.
 */

/**
 * Vencida: pendiente cuya fecha ya paso, en hora de Chile (SPEC 2.98). Una en
 * proceso ya se esta haciendo: no cuenta como vencida.
 */
export function estaVencida(m: { fechaProgramada: string | Date | null; estado: string }): boolean {
  return (
    m.estado === 'pendiente' && !!m.fechaProgramada && aValorInputDate(m.fechaProgramada) < hoyISO()
  );
}

/**
 * Aviso para una fecha programada que ya paso (SPEC 2.101): se puede
 * guardar, pero quedara vencida desde el primer momento. Recibe "YYYY-MM-DD".
 */
export function avisoFechaPasada(fechaISO: string): string | undefined {
  return fechaISO && fechaISO < hoyISO() ? 'Esa fecha ya pasó: quedará como vencida.' : undefined;
}

/**
 * La mantencion que se cierra como "Sin reparación" al dar de baja un equipo
 * (SPEC 2.88, 2.96): la que esta en proceso o, si no hay, la pendiente mas
 * antigua (la lista viene ordenada por creacion). Las demas se cancelan.
 */
export function mantencionACerrar<T extends { estado: string }>(abiertas: T[]): T | undefined {
  return abiertas.find((m) => m.estado === 'en_proceso') ?? abiertas[0];
}
