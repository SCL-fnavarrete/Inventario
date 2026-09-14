import type { SesionAutenticada } from './guard';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Aislamiento de datos por sede -- unico punto de verdad.
 *
 * Regla (ver SPEC 2.9): `admin` ve y puede crear en cualquier sede. `tecnico`
 * (el unico otro rol -- ver permissions.ts) queda restringido a los
 * registros de SU sede -- la que tiene asignada en `SystemUser.sedeId`.
 * La sede de un registro no se elige en su formulario: se hereda de quien
 * lo crea, para que nunca se pueda cruzar sin querer.
 *
 * Aplica a los 4 modulos operativos que se cruzan entre sedes: activos,
 * empleados, solicitudes y guias de despacho. No aplica a datos maestros
 * (categorias, proveedores) ni a compras/reportes, que son globales.
 */

/** ¿Este rol ve todas las sedes sin restriccion? */
export function tieneVisibilidadTotal(session: SesionAutenticada): boolean {
  return session.user.role === 'admin';
}

/**
 * Fragmento de `where` de Prisma que restringe el listado/lectura por
 * sede. Se usa con spread: `{ ...sedeWhere(session), ...otrosFiltros }`.
 *
 * Un usuario no-admin sin sede asignada no debe ver nada (en vez de que
 * `sedeId: null` matchee por accidente registros huerfanos) -- de ahi el
 * sentinel que no matchea ninguna fila real.
 */
export function sedeWhere(session: SesionAutenticada): Record<string, unknown> {
  if (tieneVisibilidadTotal(session)) return {};
  return { sedeId: session.user.sedeId ?? '__sin_sede_asignada__' };
}

/**
 * Exige que el registro (ya cargado) pertenezca a la sede de la sesion.
 * Lanza 404 -- no 403 -- para no revelar que el registro existe en otra
 * sede. Admin siempre pasa.
 */
export function assertSedeAccess(
  session: SesionAutenticada,
  registroSedeId: string | null | undefined,
  mensaje = 'Recurso no encontrado'
): void {
  if (tieneVisibilidadTotal(session)) return;
  if (!session.user.sedeId || registroSedeId !== session.user.sedeId) {
    throw new NotFoundError(mensaje);
  }
}

/**
 * Sede que corresponde asignar a un registro nuevo.
 *
 * - No-admin: siempre la suya (se ignora cualquier `sedeId` que venga en el
 *   body -- el formulario no debe ofrecer el campo). Si no tiene sede
 *   asignada, se rechaza la creacion con un mensaje util en vez de crear un
 *   registro huerfano que nadie va a poder ver despues.
 * - Admin: elige explicitamente la sede (crea "para" esa sede). Antes se
 *   permitia dejarlo en blanco ("sin sede, transversal"), pero en la
 *   practica eso dejaba el registro visible solo para el admin -- ningun
 *   tecnico lo veia nunca, porque su filtro por sede nunca calza con
 *   `sedeId = null`. Por eso ahora `requerido` (activado en los 4 modulos
 *   operativos que ofrecen el selector a admin: activos, empleados,
 *   solicitudes y guias-despacho -- sede origen) exige elegir una sede
 *   real, igual que un no-admin. Queda `false` por defecto solo por si a
 *   futuro se agrega otro caller sin selector todavia en su formulario.
 *   Ver SPEC 2.8.2 y 2.9.2 (11-sep-2026).
 */
export function sedeIdParaCrear(
  session: SesionAutenticada,
  sedeIdSolicitada?: string | null,
  opts?: { requerido?: boolean }
): string | null {
  if (tieneVisibilidadTotal(session)) {
    if (opts?.requerido && !sedeIdSolicitada) {
      throw new ValidationError('Debes seleccionar una sede.');
    }
    return sedeIdSolicitada || null;
  }
  if (!session.user.sedeId) {
    throw new ValidationError(
      'Tu usuario no tiene una sede asignada. Pide a un administrador que te asigne una en Configuración > Usuarios.'
    );
  }
  return session.user.sedeId;
}
