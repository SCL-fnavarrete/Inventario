import { Prisma } from '@prisma/client';

/**
 * Filtro de activos vigentes.
 *
 * Un activo con `deletedAt` es un registro descartado -- tipicamente un
 * duplicado que dejo una importacion -- y no debe aparecer en listados,
 * busquedas, reportes ni estadisticas (SPEC 2.7.7). Su ficha y su historial
 * siguen accesibles por id: lo que se oculta es el registro, no la evidencia.
 *
 * Se usa como fragmento en el `where`:
 *
 *   prisma.asset.findMany({ where: { ...ACTIVOS_VIGENTES, estado } })
 *
 * Deliberadamente NO se aplica en:
 *  - la importacion, que necesita ver los descartados para detectar que un
 *    numero de serie ya esta ocupado;
 *  - las utilidades de mantenimiento de la base, que cuentan filas reales.
 */
export const ACTIVOS_VIGENTES = { deletedAt: null } satisfies Prisma.AssetWhereInput;
