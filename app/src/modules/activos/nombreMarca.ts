/**
 * Una sola forma de escribir cada marca (SPEC 2.116.4): sin mayusculas y
 * minusculas mezcladas al azar. Es pura; la usan el catalogo (al crear y
 * renombrar) y la importacion (al proponer el nombre de una marca nueva).
 *
 * - Siglas de hasta 4 letras en mayusculas se conservan (HP, LG, AOC, TP-LINK).
 * - Lo escrito todo en minusculas o todo en mayusculas se pasa a "Dell".
 * - Lo que ya trae mayusculas y minusculas a proposito se respeta (HyperX, iPhone).
 */
export function nombreDeMarca(texto: string): string {
  return texto
    .trim()
    .replace(/\s+/g, ' ')
    .split(/([\s-]+)/)
    .map((p) => {
      if (!/[a-zA-ZáéíóúñÁÉÍÓÚÑ]/.test(p)) return p;
      const mayus = p === p.toUpperCase();
      const minus = p === p.toLowerCase();
      if (mayus && p.length <= 4) return p;
      if (!mayus && !minus) return p;
      return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
    })
    .join('');
}
