import type { Prisma } from '@prisma/client';
/**
 * Cada tarjeta del resumen de Guias es un filtro (SPEC 2.108): la misma
 * condicion cuenta la tarjeta y filtra la lista al pulsarla.
 */
export const VISTAS_GUIA = {
  en_transito: (): Prisma.DispatchGuideWhereInput => ({ estado: 'en_transito' }),
  recibida_parcial: (): Prisma.DispatchGuideWhereInput => ({ estado: 'recibida_parcial' }),
  recibida: (): Prisma.DispatchGuideWhereInput => ({ estado: 'recibida' }),
  anulada: (): Prisma.DispatchGuideWhereInput => ({ estado: 'anulada' }),
  /** Lo que falta recibir: en camino o con faltantes; con sede elegida, solo lo que va hacia ella. */
  por_recibir: (sedeId: string | null): Prisma.DispatchGuideWhereInput => ({
    estado: { in: ['en_transito', 'recibida_parcial'] },
    ...(sedeId ? { sedeDestinoId: sedeId } : {}),
  }),
} as const;

export type VistaGuia = keyof typeof VISTAS_GUIA;
