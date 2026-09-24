import { aValorInputDate, hoyISO } from '@/lib/utils/fechas';

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
 * La mantencion que se cierra como "Sin reparación" al dar de baja un equipo
 * (SPEC 2.88, 2.96): la que esta en proceso o, si no hay, la pendiente mas
 * antigua (la lista viene ordenada por creacion). Las demas se cancelan.
 */
export function mantencionACerrar<T extends { estado: string }>(abiertas: T[]): T | undefined {
  return abiertas.find((m) => m.estado === 'en_proceso') ?? abiertas[0];
}
