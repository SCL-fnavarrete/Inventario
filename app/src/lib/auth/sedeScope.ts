import type { SesionAutenticada } from './guard';
import { NotFoundError, ValidationError } from '@/lib/errors';

/**
 * Aislamiento de datos por sede -- unico punto de verdad.
 *
 * Un tecnico queda amarrado a SU sede, tanto en la interfaz como en el
 * backend; solo `admin` ve y elige entre todas las sedes.
 *
 * El candado se aplica aca (no solo en el selector del nav) para que no se
 * pueda evadir por URL directa o llamando la API a mano. Se restringe por
 * donde pasan los listados (`sedeWhere`), las fichas (`assertSedeAccess`),
 * la creacion (`sedeIdParaCrear`) y el parametro `?sedeId=` de los
 * endpoints de listado, que solo tiene efecto para quien ve todas las
 * sedes.
 */

/** ¿Este rol ve todas las sedes sin restriccion? Hoy: solo admin. */
export function tieneVisibilidadTotal(session: Pick<SesionAutenticada, "user"> | { user: { role: string } }): boolean {
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
 * `sedeWhere` mas un filtro de sede opcional (la del navbar, por cookie o
 * `?sedeId=`). El filtro solo aplica a quien ve todas las sedes: para el
 * resto manda su propia sede, se pida lo que se pida.
 */
export function sedeWhereConFiltro(
  session: SesionAutenticada,
  sedeIdFiltro?: string | null
): Record<string, unknown> {
  if (sedeIdFiltro && tieneVisibilidadTotal(session)) return { sedeId: sedeIdFiltro };
  return sedeWhere(session);
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
 * - Con visibilidad total: elige explicitamente la sede (crea "para" esa
 *   sede). `requerido` (activado en los modulos operativos que ofrecen el
 *   selector: activos, empleados, solicitudes y guias-despacho -- sede
 *   origen) exige elegir una sede real en vez de dejarla en blanco, para
 *   no dejar el registro invisible para cualquier filtro de sede real.
 * - Sin visibilidad total: siempre la suya, ignorando cualquier `sedeId`
 *   que venga en el body. Si no tiene sede asignada, se rechaza la
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
