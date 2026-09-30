/**
 * Usuario con que se inicia sesion (SPEC 2.122): minusculas, numeros, punto,
 * guion y guion bajo, de 3 a 30 caracteres. Sin base de datos: sirve en
 * pantallas y en el servidor.
 */
export const USUARIO_MIN = 3;
export const USUARIO_MAX = 30;
export const FORMATO_USUARIO = /^[a-z0-9._-]+$/;

/** Como se guarda y se compara: sin espacios a los lados y en minusculas. */
export const normalizarUsuario = (texto: string) => texto.trim().toLowerCase();

/** "Javier Soto (jsoto)": como se muestra quien hizo algo. */
export function nombreConUsuario(nombre: string | null | undefined, usuario: string | null | undefined) {
  if (nombre && usuario) return `${nombre} (${usuario})`;
  return nombre || usuario || '';
}
