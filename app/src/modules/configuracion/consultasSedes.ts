/**
 * Todo lo que usa una sede (Configuracion > Sedes, SPEC 2.170): solo se
 * elimina una sede que nada usa, asi no se pierde historial. Cuenta tambien
 * los equipos dados de baja o descartados: siguen apuntando a su sede.
 */
export const USO_SEDE = {
  _count: {
    select: {
      assets: true,
      empleados: true,
      usuarios: true,
      lineas: true,
      kitItems: true,
      guias: true,
      guiasDestino: true,
      compras: true,
      repartosKit: true,
      solicitudes: true,
    },
  },
} as const;

export type UsoSede = Record<keyof (typeof USO_SEDE)['_count']['select'], number>;

/** Cada uso en palabras: [singular, plural]. Despachos de salida y de llegada se suman. */
const PALABRAS: [keyof UsoSede | 'despachos', string, string][] = [
  ['assets', 'equipo', 'equipos'],
  ['empleados', 'persona', 'personas'],
  ['usuarios', 'usuario', 'usuarios'],
  ['lineas', 'línea', 'líneas'],
  ['kitItems', 'artículo de Kit/EPP', 'artículos de Kit/EPP'],
  ['despachos', 'despacho', 'despachos'],
  ['compras', 'compra', 'compras'],
  ['repartosKit', 'reparto de compra', 'repartos de compra'],
  ['solicitudes', 'solicitud', 'solicitudes'],
];

/** "3 equipos y 2 personas", o "" si nada la usa. */
export function usoSedeEnPalabras(uso: UsoSede): string {
  const conteo = { ...uso, despachos: uso.guias + uso.guiasDestino };
  const partes = PALABRAS.filter(([k]) => conteo[k] > 0).map(([k, uno, varios]) => `${conteo[k]} ${conteo[k] === 1 ? uno : varios}`);
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : (partes[0] ?? '');
}
