import type { TipoEvento } from '@prisma/client';
import type { Tono } from '@/shared/constantes/tonos';

/**
 * Como se muestran en el Dashboard los eventos de un equipo: nombre corto y
 * tono (el color sale del tipo de evento, no es decorativo).
 */
export const EVENTO_ACTIVO: Record<TipoEvento, { label: string; tono: Tono }> = {
  creacion: { label: 'Alta', tono: 'primary' },
  asignacion: { label: 'Entrega', tono: 'success' },
  devolucion: { label: 'Devolución', tono: 'orange' },
  mantencion: { label: 'Mantención', tono: 'warning' },
  cambio_estado: { label: 'Cambio de estado', tono: 'neutral' },
  actualizacion_specs: { label: 'Edición', tono: 'neutral' },
  baja: { label: 'Baja', tono: 'danger' },
  solicitud_workflow: { label: 'Solicitud', tono: 'primary' },
  traslado: { label: 'Traslado', tono: 'primary' },
  compra: { label: 'Compra', tono: 'primary' },
};
