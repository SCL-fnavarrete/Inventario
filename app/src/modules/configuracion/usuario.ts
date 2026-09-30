import { removeAccents } from '@/shared/utilidades/text';
import { normalizarUsuario, USUARIO_MAX, USUARIO_MIN } from '@/shared/auth/usuario';

export { FORMATO_USUARIO, normalizarUsuario, USUARIO_MAX, USUARIO_MIN } from '@/shared/auth/usuario';

/**
 * Usuario sugerido para un nombre completo (SPEC 2.122): inicial del primer
 * nombre y el primer apellido, sin tildes ni ñ. Con 4 palabras o mas el
 * apellido es la tercera ("Javier Andrés Soto Jaque" -> jsoto); con 2 o 3, la
 * segunda ("Javier Soto Jaque" -> jsoto). Si ya existe, le agrega un numero
 * (jsoto2). "" si el nombre no alcanza para armar uno.
 */
export function sugerirUsuario(nombre: string, ocupados: Iterable<string> = []): string {
  const palabras = removeAccents(nombre)
    .split(/\s+/)
    .map((p) => p.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
  if (palabras.length === 0) return '';
  const apellido = palabras.length >= 4 ? palabras[2] : (palabras[1] ?? '');
  const base = (palabras[0][0] + apellido).slice(0, USUARIO_MAX - 2);
  if (base.length < USUARIO_MIN) return '';
  const usados = new Set(Array.from(ocupados, normalizarUsuario));
  let usuario = base;
  for (let n = 2; usados.has(usuario); n++) usuario = `${base}${n}`;
  return usuario;
}
