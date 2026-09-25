import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SesionAutenticada } from '@/lib/auth/guard';
import { tieneVisibilidadTotal } from '@/lib/auth/sedeScope';

// Reglas de permisos sin base de datos (las usan tambien las pantallas).
export { puedeAnularGuia, puedeConfirmarRecepcion, puedeVerGuia } from '@/lib/auth/permisosGuia';

/**
 * Quien ve una guia de despacho (SPEC 2.108). A diferencia del resto de los
 * modulos, a una guia le importan DOS sedes: la que despacha y la que recibe,
 * porque el tecnico receptor tambien necesita verla y confirmar su recepcion.
 * Admin ve todas. Un solo lugar para la lista y el detalle.
 */
export function whereGuiaVisible(session: SesionAutenticada): Prisma.DispatchGuideWhereInput {
  if (tieneVisibilidadTotal(session)) return {};
  const sedeId = session.user.sedeId ?? '__sin_sede_asignada__';
  return { OR: [{ sedeId }, { sedeDestinoId: sedeId }] };
}

/**
 * Sede "mia" para la tarjeta "Por recibir en mi sede": la propia, o para
 * quien ve todas, la elegida en el menu. null = no aplica.
 */
export function sedePropiaGuias(session: SesionAutenticada, sedeIdFiltro?: string | null) {
  return tieneVisibilidadTotal(session) ? sedeIdFiltro || null : session.user.sedeId;
}

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

/**
 * ¿El equipo viene en camino a la sede de la sesion? La sede destino puede
 * ver su ficha (solo lectura) aunque todavia sea de la sede de origen.
 */
export async function vieneAMiSede(session: SesionAutenticada, assetId: string): Promise<boolean> {
  const sede = session.user.sedeId;
  if (!sede) return false;
  const n = await prisma.asset.count({ where: { id: assetId, ...whereActivosPorLlegar(sede) } });
  return n > 0;
}
