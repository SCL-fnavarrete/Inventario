import { tieneVisibilidadTotal } from '@/lib/auth/sedeScope';

/**
 * Quien puede hacer que con una guia de despacho (SPEC 2.108). Sin acceso a
 * la base: los usan el servidor y las pantallas, asi un boton visible nunca
 * lleva a un rechazo. Admin puede todo.
 */
type Sesion = { user: { role: string; sedeId?: string | null } };

/** Ver la guia: la sede que despacha y la que recibe. */
export function puedeVerGuia(
  session: Sesion,
  guia: { sedeId: string | null; sedeDestinoId: string }
): boolean {
  if (tieneVisibilidadTotal(session)) return true;
  const sedeId = session.user.sedeId;
  return !!sedeId && (guia.sedeId === sedeId || guia.sedeDestinoId === sedeId);
}

/** Confirmar la recepcion y resolver faltantes: la sede destino. */
export function puedeConfirmarRecepcion(session: Sesion, guia: { sedeDestinoId: string }): boolean {
  return tieneVisibilidadTotal(session) || session.user.sedeId === guia.sedeDestinoId;
}

/** Anular mientras va en transito: la sede que despacho. */
export function puedeAnularGuia(session: Sesion, guia: { sedeId: string | null }): boolean {
  return tieneVisibilidadTotal(session) || (!!guia.sedeId && session.user.sedeId === guia.sedeId);
}
