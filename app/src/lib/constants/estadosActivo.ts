import type { CondicionActivo, EstadoActivo } from '@prisma/client';
import { COLOR_MARCA } from './coloresGraficos';

/**
 * Presentacion de los estados y condiciones del activo -- unico punto de
 * verdad. Antes cada pantalla tenia su copia y ya se habian separado (En
 * Mantencion salia amarillo en Activos y naranjo en Reportes). Tipado
 * contra los enums de Prisma: un estado nuevo sin etiqueta es error de
 * compilacion, no una celda en blanco.
 */

export const ESTADO_ACTIVO_LABEL: Record<EstadoActivo, string> = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  en_mantencion: 'En Mantención',
  no_devuelto: 'No devuelto',
  baja: 'Baja',
  vendido: 'Vendido',
};

/** Clases de badge (fondo + texto + borde) por estado. */
export const ESTADO_ACTIVO_BADGE: Record<EstadoActivo, string> = {
  disponible: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  asignado: 'bg-primary-50 text-primary-800 border-primary-200',
  en_mantencion: 'bg-amber-50 text-amber-800 border-amber-200',
  no_devuelto: 'bg-orange-50 text-orange-800 border-orange-200',
  baja: 'bg-red-50 text-red-800 border-red-200',
  vendido: 'bg-gray-100 text-fg-muted border-line',
};

/**
 * Color por estado para graficos. Recharts pinta SVG y necesita el valor
 * literal, no una clase; son los mismos tonos que ESTADO_ACTIVO_BADGE
 * (asignado = COLOR_MARCA.primario).
 */
export const ESTADO_ACTIVO_COLOR: Record<EstadoActivo, string> = {
  disponible: '#10b981',
  asignado: COLOR_MARCA.primario,
  en_mantencion: '#f59e0b',
  no_devuelto: '#ea580c',
  baja: '#ef4444',
  vendido: '#6b7280',
};

export const CONDICION_ACTIVO_LABEL: Record<CondicionActivo, string> = {
  nuevo: 'Nuevo',
  usado: 'Usado',
  danado: 'Dañado',
};

export const CONDICION_ACTIVO_BADGE: Record<CondicionActivo, string> = {
  nuevo: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  usado: 'bg-amber-50 text-amber-800 border-amber-200',
  danado: 'bg-red-50 text-red-800 border-red-200',
};

/** Etiqueta de un estado que puede venir como texto libre (URL, Excel). */
export function etiquetaEstadoActivo(estado: string): string {
  return ESTADO_ACTIVO_LABEL[estado as EstadoActivo] ?? estado;
}
