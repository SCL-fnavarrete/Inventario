import type { SesionAutenticada } from './guard';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Aislamiento de datos por sede -- unico punto de verdad.
 *
 * DECISION VIGENTE, 18-sep-2026 (SPEC 2.29.1, pedido explicito de Javier):
 * un tecnico queda amarrado a SU sede, en la interfaz y en el backend.
 * Textual: "si inicio sesion con un tecnico de Santiago, en el navbar
 * automaticamente este seleccionada esa sede y no se pueda cambiar. Y lo
 * mismo con todos los modulos y todos los formularios que piden la sede."
 * Solo `admin` ve y elige entre todas las sedes.
 *
 * Esta es la TERCERA vuelta sobre la misma decision, asi que conviene
 * conocer las dos anteriores antes de tocar esto:
 *  - SPEC 2.24: tecnico restringido a su sede; se blindaron 5 rutas.
 *  - SPEC 2.29 (14-sep): se abrio -- tecnico paso a tener visibilidad total
 *    y el filtro por sede quedo como algo de UI. El motivo fue Peru (~10
 *    equipos): no tener que crear un usuario dedicado solo para verlos.
 *  - SPEC 2.29.1 (hoy): se cierra de nuevo, asumiendo esa consecuencia --
 *    para mirar otra sede hay que entrar como admin o con un usuario de esa
 *    sede. Javier lo decidio sabiendolo.
 *
 * Que el candado sea real y no cosmetico es justamente lo que se pidio: no
 * basta con bloquear el selector del nav, porque un tecnico podria entrar
 * por URL directa a una ficha de otra sede o llamar la API a mano. Por eso
 * se restringe aca, que es por donde pasan los listados (`sedeWhere`), las
 * fichas (`assertSedeAccess`), la creacion (`sedeIdParaCrear`) y el
 * parametro `?sedeId=` de los endpoints de listado, que solo tiene efecto
 * para quien ve todas las sedes.
 */

/** ¿Este rol ve todas las sedes sin restriccion? Hoy: solo admin. */
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
 * 18-sep-2026 (SPEC 2.29.1): con `tieneVisibilidadTotal` restringido de
 * nuevo a admin, un tecnico vuelve a caer en la segunda rama -- se le asigna
 * SU sede y se ignora cualquier `sedeId` que venga en el body. Los
 * formularios se la muestran ya puesta y bloqueada; esto lo hace cumplir
 * aunque alguien llame la API a mano.
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
