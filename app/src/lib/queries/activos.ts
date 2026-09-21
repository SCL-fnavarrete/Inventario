import { Prisma } from '@prisma/client';

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
