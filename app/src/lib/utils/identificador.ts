/**
 * Lo que identifica a un equipo en listas y detalles (SPEC 2.112.7): su
 * N° de serie o, si no tiene (un celular puede no tenerlo), su IMEI.
 */
export function identificadorActivo(
  activo: { numeroSerie?: string | null; imei?: string | null } | null | undefined,
  siVacio = "Sin serie"
): string {
  if (activo?.numeroSerie) return activo.numeroSerie;
  if (activo?.imei) return `IMEI ${activo.imei}`;
  return siVacio;
}
