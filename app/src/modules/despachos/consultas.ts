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
  /** Lo que la sede tiene que atender: en camino hacia ella o con faltantes. */
  por_recibir: (sedeId: string | null): Prisma.DispatchGuideWhereInput => ({
    estado: { in: ['en_transito', 'recibida_parcial'] },
    sedeDestinoId: sedeId ?? '__sin_sede__',
  }),
} as const;

export type VistaGuia = keyof typeof VISTAS_GUIA;

/**
 * Equipos que vienen en camino a una sede (tarjeta "Por llegar" de Activos,
 * SPEC 2.108): en transito en una guia que la tiene como destino y que aun
 * no se resuelve. Todavia son de la sede de origen; la destino solo los ve.
 */
export function whereActivosPorLlegar(sedeDestinoId: string | null): Prisma.AssetWhereInput {
  return {
    deletedAt: null,
    estado: 'en_transito',
    dispatchItems: {
      some: {
        estado: 'en_transito',
        guide: {
          sedeDestinoId: sedeDestinoId ?? '__sin_sede__',
          estado: { in: ['en_transito', 'recibida_parcial'] },
        },
      },
    },
  };
}
