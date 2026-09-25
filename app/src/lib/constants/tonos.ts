import type { EstadoActivo } from '@prisma/client';

/** Tono semantico de un indicador o tarjeta. */
export type Tono = 'neutral' | 'primary' | 'success' | 'warning' | 'orange' | 'danger' | 'purple';

/**
 * Color de acento de `card-feature` (globals.css) por tono. Se toma el 500
 * de cada escala, que no se invierte en modo oscuro. Clases literales para
 * que Tailwind las detecte al escanear el codigo.
 */
export const TONO_ACENTO: Record<Tono, string> = {
  neutral: '[--card-accent:var(--color-gray-400)]',
  primary: '[--card-accent:var(--color-primary-500)]',
  success: '[--card-accent:var(--color-emerald-500)]',
  warning: '[--card-accent:var(--color-amber-500)]',
  orange: '[--card-accent:var(--color-orange-500)]',
  danger: '[--card-accent:var(--color-red-500)]',
  purple: '[--card-accent:var(--color-purple-500)]',
};

/**
 * Clases por tono: valor numerico, bloque suave e icono en circulo. Un solo
 * mapa para que "danger" sea el mismo rojo en KPIs, filtros y resumenes.
 */
export const TONO_ESTILO: Record<Tono, { valor: string; suave: string; icono: string }> = {
  neutral: { valor: 'text-fg', suave: 'bg-surface-muted', icono: 'bg-gray-100 text-fg-muted' },
  primary: { valor: 'text-primary-700', suave: 'bg-primary-50', icono: 'bg-primary-100 text-primary-700' },
  success: { valor: 'text-emerald-700', suave: 'bg-emerald-50', icono: 'bg-emerald-100 text-emerald-700' },
  warning: { valor: 'text-amber-700', suave: 'bg-amber-50', icono: 'bg-amber-100 text-amber-700' },
  orange: { valor: 'text-orange-700', suave: 'bg-orange-50', icono: 'bg-orange-100 text-orange-700' },
  danger: { valor: 'text-red-700', suave: 'bg-red-50', icono: 'bg-red-100 text-red-700' },
  purple: { valor: 'text-purple-700', suave: 'bg-purple-50', icono: 'bg-purple-100 text-purple-700' },
};

/** Tono de cada estado del activo: mismo color que su badge (estadosActivo.ts). */
export const ESTADO_ACTIVO_TONO: Record<EstadoActivo, Tono> = {
  disponible: 'success',
  asignado: 'primary',
  en_mantencion: 'warning',
  no_devuelto: 'orange',
  baja: 'danger',
  vendido: 'neutral',
  en_transito: 'primary',
  por_repartir: 'purple',
};
