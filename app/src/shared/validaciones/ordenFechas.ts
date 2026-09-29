/**
 * Orden entre dos fechas de un mismo registro (auditoria 27-sep-2026, 2.5):
 * un empleado no termina antes de ingresar y una garantia no vence antes de
 * la compra. Lo usan los schemas de creacion (ambas fechas vienen juntas) y
 * los PUT, que comparan contra la fecha ya guardada cuando solo llega una.
 */
export const MENSAJE_TERMINO_ANTES_DE_INGRESO =
  "La fecha de término no puede ser anterior a la fecha de ingreso";
export const MENSAJE_GARANTIA_ANTES_DE_COMPRA =
  "El fin de la garantía no puede ser anterior a la fecha de compra";

type FechaEntrada = Date | string | null | undefined;

function aMilisegundos(valor: FechaEntrada): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const ms = valor instanceof Date ? valor.getTime() : Date.parse(valor);
  return Number.isNaN(ms) ? null : ms;
}

/** true solo si ambas fechas existen y `fin` cae antes que `inicio`. */
export function terminaAntesDeEmpezar(inicio: FechaEntrada, fin: FechaEntrada): boolean {
  const a = aMilisegundos(inicio);
  const b = aMilisegundos(fin);
  return a !== null && b !== null && b < a;
}
