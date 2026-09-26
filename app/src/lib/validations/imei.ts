/**
 * IMEI de un celular (SPEC 2.112.7): es lo que lo identifica como unico,
 * igual que el N° de serie en los demas equipos. Se guarda solo el principal
 * (el primero que muestra *#06#). Lo usan la pantalla y el servidor.
 */

/** Quita espacios, guiones y puntos con que suele copiarse ("35-693803-564380-9"). */
export function normalizarImei(imei: string | null | undefined): string {
  return (imei ?? '').replace(/[\s.-]/g, '');
}

/**
 * Error del IMEI o null si es valido: 15 digitos y el ultimo es el digito
 * verificador de la formula estandar (Luhn), que detecta casi todos los
 * errores de tipeo.
 */
export function validarImei(imei: string | null | undefined): string | null {
  const valor = normalizarImei(imei);
  if (!/^\d{15}$/.test(valor)) return 'El IMEI debe tener 15 números';
  let suma = 0;
  for (let i = 0; i < 14; i++) {
    let d = Number(valor[i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    suma += d;
  }
  const verificador = (10 - (suma % 10)) % 10;
  return verificador === Number(valor[14]) ? null : 'El IMEI no es válido: revisa los números';
}
