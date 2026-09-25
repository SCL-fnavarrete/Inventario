import { Prisma } from '@prisma/client';
import type { SesionAutenticada } from '@/lib/auth/guard';
import { sedeWhere, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { estadoActivoEnum } from '@/lib/validations/asset';
import { sedePropiaGuias, vieneAMiSede, whereActivosPorLlegar } from '@/lib/queries/guias';

/**
 * Filtro de activos vigentes.
 *
 * Un activo con `deletedAt` es un registro descartado (tipicamente un
 * duplicado dejado por una importacion) y no debe aparecer en listados,
 * busquedas, reportes ni estadisticas. Su ficha y su historial siguen
 * accesibles por id: se oculta el registro, no la evidencia.
 *
 * Se usa como fragmento en el `where`:
 *
 *   prisma.asset.findMany({ where: { ...ACTIVOS_VIGENTES, estado } })
 *
 * No se aplica en la importacion (necesita ver los descartados para
 * detectar numeros de serie ya ocupados) ni en utilidades de mantenimiento
 * de la base que cuentan filas reales.
 */
export const ACTIVOS_VIGENTES = { deletedAt: null } satisfies Prisma.AssetWhereInput;

/**
 * Filtros de la lista de Activos, que la exportacion a Excel repite tal cual
 * (asi el archivo trae lo mismo que se ve en pantalla):
 * - vigentes y de la sede de la sesion; o, con `porLlegar`, los que vienen
 *   en camino a mi sede (SPEC 2.108), que todavia son de la sede de origen;
 *   o, en "Por repartir", los de todas las sedes: el tecnico tambien ve lo
 *   que se esta por repartir (SPEC 2.111.6);
 * - estado (uno desconocido, de una URL editada a mano, se ignora) y categoria;
 * - sede elegida en el menu, solo para quien ve todas.
 */
export function whereFiltrosActivos(
  session: SesionAutenticada,
  f: { estado?: string; categoriaId?: string; sedeIdFiltro?: string; porLlegar?: boolean }
): Prisma.AssetWhereInput {
  const where: Prisma.AssetWhereInput = f.porLlegar
    ? whereActivosPorLlegar(sedePropiaGuias(session, f.sedeIdFiltro))
    : f.estado === 'por_repartir'
      ? { ...ACTIVOS_VIGENTES }
      : { ...ACTIVOS_VIGENTES, ...sedeWhere(session) };
  const estado = estadoActivoEnum.safeParse(f.estado);
  if (estado.success) where.estado = estado.data;
  if (f.categoriaId) where.categoriaId = f.categoriaId;
  if (f.sedeIdFiltro && tieneVisibilidadTotal(session) && !f.porLlegar) where.sedeId = f.sedeIdFiltro;
  return where;
}

/**
 * ¿La sesion puede abrir la ficha de este equipo? La de su sede; la de uno
 * que viene en camino a su sede (SPEC 2.108); y la de uno "Por repartir" de
 * cualquier sede (SPEC 2.111.6). Admin, todas. La usan la API y la pagina.
 */
export async function puedeVerActivo(
  session: SesionAutenticada,
  asset: { id: string; sedeId: string | null; estado: string }
): Promise<boolean> {
  if (tieneVisibilidadTotal(session)) return true;
  if (asset.sedeId && asset.sedeId === session.user.sedeId) return true;
  if (asset.estado === 'por_repartir') return true;
  return vieneAMiSede(session, asset.id);
}

/** Palabras de un termino de busqueda, sin espacios de sobra. */
export function palabrasDeBusqueda(termino: string): string[] {
  return termino.trim().split(/\s+/).filter(Boolean);
}

/**
 * Condicion de busqueda de UNA palabra sobre un activo: debe aparecer en
 * alguno de sus datos o en los de la persona que lo tiene. Se combina con
 * AND por palabra, asi "lenovo perez" encuentra el Lenovo de Pérez aunque
 * esten en campos distintos. La comparten Activos y Mantenciones, que antes
 * tenian cada una su propia lista (Activos no buscaba por persona).
 */
export function busquedaActivo(palabra: string): Prisma.AssetWhereInput {
  const c = { contains: palabra, mode: 'insensitive' as const };
  return {
    OR: [
      { numeroSerie: c },
      { marca: c },
      { modelo: c },
      { nombreEquipo: c },
      { numeroTelefono: c },
      { ubicacionFisica: c },
      { categoria: { nombre: c } },
      { empleadoActual: { nombres: c } },
      { empleadoActual: { apellidoPaterno: c } },
      { empleadoActual: { apellidoMaterno: c } },
      { empleadoActual: { rut: c } },
      { empleadoActual: { correoEmpresa: c } },
    ],
  };
}
