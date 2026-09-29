import type { ResultadoMantencion } from '@/modules/activos/validacionesTransicion';

/**
 * Nombre de cada resultado de una mantencion (SPEC 2.99): dice como quedo
 * el equipo, no solo una palabra suelta. El valor interno no cambia. Lo usan
 * el detalle, la baja, el historial y la auditoria.
 */
export const RESULTADO_MANTENCION_LABEL: Record<ResultadoMantencion, string> = {
  reparado: 'Reparado, vuelve a uso',
  pendiente_repuestos: 'En espera de repuestos',
  no_reparable: 'Sin reparación',
};

export function etiquetaResultadoMantencion(resultado: string): string {
  return RESULTADO_MANTENCION_LABEL[resultado as ResultadoMantencion] ?? resultado;
}
