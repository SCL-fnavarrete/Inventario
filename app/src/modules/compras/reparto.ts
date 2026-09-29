/**
 * Avance del reparto de una compra (SPEC 2.111). Sin acceso a la base: lo
 * usan el servidor (compraService.avanceReparto) y las pantallas.
 */
export type EstadoReparto = 'por_repartir' | 'repartida_en_parte' | 'repartida';

export type AvanceReparto = {
  pendiente: number;
  repartido: number;
  estado: EstadoReparto | null;
};

export const ESTADO_REPARTO_LABEL: Record<EstadoReparto, string> = {
  por_repartir: 'Por repartir',
  repartida_en_parte: 'Repartida en parte',
  repartida: 'Repartida',
};

export const ESTADO_REPARTO_BADGE: Record<EstadoReparto, string> = {
  por_repartir: 'bg-purple-50 text-purple-800 border-purple-200',
  repartida_en_parte: 'bg-amber-50 text-amber-800 border-amber-200',
  repartida: 'bg-emerald-50 text-emerald-800 border-emerald-200',
};
