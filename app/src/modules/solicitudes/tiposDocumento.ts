/**
 * Documento que corresponde a una solicitud ya ejecutada, o null. Unico
 * punto de verdad para la lista y el detalle de Solicitudes (antes cada una
 * tenia su copia). El acta de una desvinculacion solo existe si en ese ticket
 * se devolvio algo: `tieneActa` lo calcula el servidor (SPEC 2.87).
 */
export type DocumentoSolicitud = {
  tipo: 'comprobante-entrega' | 'acta-devolucion' | 'comprobante-cambio';
  label: string;
};

export function documentoDeSolicitud(s: {
  tipo: string;
  estado: string;
  tieneActa?: boolean;
}): DocumentoSolicitud | null {
  if (s.tipo === 'onboarding' && (s.estado === 'equipos_entregados' || s.estado === 'registro_rrhh')) {
    return { tipo: 'comprobante-entrega', label: 'Comprobante de Entrega' };
  }
  if (
    s.tipo === 'offboarding' &&
    (s.estado === 'equipo_recibido' || s.estado === 'consolidacion_cierre') &&
    s.tieneActa
  ) {
    return { tipo: 'acta-devolucion', label: 'Acta de Devolución' };
  }
  if (s.tipo === 'cambio_equipo' && (s.estado === 'cambio_ejecutado' || s.estado === 'confirmacion_rrhh')) {
    return { tipo: 'comprobante-cambio', label: 'Comprobante de Cambio' };
  }
  return null;
}
