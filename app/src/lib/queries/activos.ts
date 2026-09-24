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
