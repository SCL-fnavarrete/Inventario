import type { SesionAutenticada } from './guard';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Aislamiento de datos por sede -- unico punto de verdad.
 *
 * REDISEÑO 14-sep-2026 (SPEC 2.29, pedido explicito de Javier tras conocer
 * el alcance real -- equipos en Peru, ~10 unidades): tecnico deja de estar
 * restringido a su propia sede. Ya no tiene sentido crear un usuario
 * dedicado solo para ver un puñado de equipos de otra sede, y toda accion
 * relevante queda igual ligada al usuario que la ejecuto (ver
 * AssetHistoryService, historial de Solicitudes, y el nuevo registro de
 * auditoria generico para Empleados/Compras/Usuarios). Por eso `tecnico`
 * ahora tiene la misma visibilidad total que `admin` -- la diferencia entre
 * ambos roles queda solo en la matriz de permisos (`permissions.ts`,
 * Configuracion sigue siendo admin-only).
 *
 * Esto es un cambio de rumbo DELIBERADO que revierte a proposito parte de
 * SPEC 2.24 (donde se blindaron 5 rutas para que tecnico NO viera otra
 * sede). No es un bug ni hay que "corregirlo" de vuelta.
 *
 * El filtrado por sede sigue existiendo, pero pasa a ser un filtro de UI
 * (el selector de sede del nav, `?sedeId=` en los endpoints de listado),
 * no una restriccion de acceso. La sede de un registro nuevo ahora se elige
 * siempre explicitamente al crearlo (ver `sedeIdParaCrear`), para todos los
 * roles.
 */

/** ¿Este rol ve todas las sedes sin restriccion? Hoy: admin y tecnico por igual. */
export function tieneVisibilidadTotal(session: SesionAutenticada): boolean {
  return session.user.role === 'admin' || session.user.role === 'tecnico';
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
 * 14-sep-2026 (SPEC 2.29): con `tieneVisibilidadTotal` ahora true tambien
 * para tecnico, este cae siempre en la primera rama -- elige explicitamente
 * la sede igual que admin, ya no se le asigna automaticamente la suya. Cada
 * formulario que llama esto con `requerido: true` DEBE ofrecer un selector
 * de sede a cualquier rol (antes era admin-only) -- ver Activos > Nuevo.
 *
 * La segunda rama (asignar automaticamente `session.user.sedeId`) queda
 * como codigo muerto mientras solo existan los roles admin/tecnico, pero se
 * deja por si en el futuro se agrega un rol con visibilidad restringida.
 *
 * - Con visibilidad total: elige explicitamente la sede (crea "para" esa
 *   sede). Antes se permitia dejarlo en blanco ("sin sede, transversal"),
 *   pero en la practica eso dejaba el registro invisible para cualquier
 *   filtro de sede real. Por eso `requerido` (activado en los modulos
 *   operativos que ofrecen el selector: activos, empleados, solicitudes y
 *   guias-despacho -- sede origen) exige elegir una sede real. Queda
 *   `false` por defecto solo por si a futuro se agrega otro caller sin
 *   selector todavia en su formulario. Ver SPEC 2.8.2, 2.9.2 y 2.29.
 * - Sin visibilidad total: siempre la suya (se ignora cualquier `sedeId`
 *   que venga en el body). Si no tiene sede asignada, se rechaza la
 *   creacion con un mensaje util en vez de crear un registro huerfano que
 *   nadie va a poder ver despues.
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
