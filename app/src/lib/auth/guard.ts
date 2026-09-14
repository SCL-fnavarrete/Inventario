import { NextResponse } from 'next/server';
import { getServerSession, type Session } from 'next-auth';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { authOptions } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { can, type Accion, type Recurso } from './permissions';
import { ApiError, UnauthorizedError, ForbiddenError } from '@/lib/errors';

/**
 * Guard de autorizacion y traductor unico de errores para las rutas de API.
 *
 * Toda ruta de `src/app/api/**` abre con `requireSession()` o
 * `requirePermission()` y cierra con `handleApiError()`. Antes de esto,
 * 17 rutas no verificaban sesion y solo 8 verificaban rol.
 *
 * Formato unificado de error: `{ error: string, details?: unknown }`.
 * El formato inconsistente anterior (unas rutas mandaban `error`, otras
 * `message`/`details`) era la causa del "Error al actualizar activo" generico
 * documentado en CLAUDE.md: el cliente leia una clave que el servidor no
 * enviaba y caia siempre al mensaje por defecto.
 */

// Las clases de error viven en @/lib/errors para que la capa de servicios
// pueda lanzarlas sin arrastrar next-auth. Se re-exportan aca porque medio
// sistema las importa desde este modulo.
export {
  ApiError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '@/lib/errors';

/** Sesion autenticada, con el rol ya resuelto. */
export interface SesionAutenticada extends Session {
  user: Session['user'] & { id: string; role: string; sedeId: string | null };
}

/** Exige sesion. Lanza 401 si no hay. */
export async function requireSession(): Promise<SesionAutenticada> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new UnauthorizedError();
  }
  return session as SesionAutenticada;
}

/**
 * Exige sesion y permiso sobre el recurso. Lanza 401 si no hay sesion,
 * 403 si el rol no alcanza.
 */
export async function requirePermission(
  recurso: Recurso,
  accion: Accion
): Promise<SesionAutenticada> {
  const session = await requireSession();
  if (!can(session.user.role, recurso, accion)) {
    throw new ForbiddenError(
      `El rol "${session.user.role}" no puede ${accion} sobre ${recurso}`
    );
  }
  return session;
}

interface CuerpoError {
  error: string;
  details?: unknown;
}

/** Un error asociado a un campo especifico de un formulario (SPEC 2.37). */
export interface CampoError {
  field: string;
  message: string;
}

/**
 * Convierte los `issues` de un ZodError al formato uniforme que espera el
 * frontend (14-sep-2026, SPEC 2.37, pedido explicito de Javier: "si hay
 * error en un campo debe indicar el error, el tipo de error y cual es el
 * campo que genero ese error"). Antes cada ruta mandaba
 * `validationResult.error.issues` tal cual (con `path` como array), y el
 * frontend en su enorme mayoria ni siquiera lo leia -- solo mostraba
 * "Datos invalidos" a secas. Con esto, cada issue queda como
 * `{ field, message }`, donde `field` es el path unido con "." (ej.
 * "categoriaId", o "assets.0.assetId" para un array anidado).
 */
export function zodIssuesToCampoErrores(
  issues: readonly { path: readonly PropertyKey[]; message: string }[]
): CampoError[] {
  return issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '(general)',
    message: issue.message,
  }));
}

/**
 * Respuesta unificada para cuando `schema.safeParse(body)` falla (SPEC
 * 2.37). Reemplaza el `NextResponse.json({ error: "Datos invalidos",
 * details: validationResult.error.issues }, { status: 400 })` que estaba
 * repetido manualmente en ~24 rutas -- mismo mensaje, pero ahora con
 * `details` ya en el formato `{ field, message }[]` que entiende
 * `parseApiError` en el frontend (`src/lib/utils/apiErrors.ts`).
 */
export function respuestaDatosInvalidos(error: ZodError): NextResponse<CuerpoError> {
  return NextResponse.json(
    { error: 'Datos inválidos', details: zodIssuesToCampoErrores(error.issues) },
    { status: 400 }
  );
}

/**
 * Traduce cualquier error a una respuesta con el formato unificado.
 *
 * `mensajePorDefecto` conserva el mensaje que cada ruta ya daba para su fallo
 * generico ("Error al obtener activos"), para no perder contexto al unificar.
 */
export function handleApiError(
  error: unknown,
  mensajePorDefecto = 'Error interno del servidor'
): NextResponse<CuerpoError> {
  if (error instanceof ApiError) {
    // 401 y 403 no se loguean como incidente: son el guard funcionando.
    if (error.status >= 500) {
      logger.error(`[api] ${error.name}: ${error.message}`, error);
    }
    return NextResponse.json(
      error.details === undefined
        ? { error: error.message }
        : { error: error.message, details: error.details },
      { status: error.status }
    );
  }

  if (error instanceof ZodError) {
    return respuestaDatosInvalidos(error);
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const camposArr = (error.meta?.target as string[] | undefined) ?? [];
      const campos = camposArr.join(', ');
      return NextResponse.json(
        {
          error: campos
            ? `Ya existe un registro con ese valor en: ${campos}`
            : 'Ya existe un registro con ese valor unico',
          // SPEC 2.37: aunque Prisma no da un mensaje por campo especifico,
          // al menos se identifica CUAL campo duplicado es, para que el
          // frontend lo pueda marcar en el formulario.
          ...(camposArr.length > 0 && {
            details: camposArr.map((field) => ({
              field,
              message: 'Ya existe un registro con este valor',
            })),
          }),
        },
        { status: 409 }
      );
    }
    if (error.code === 'P2025') {
      return NextResponse.json({ error: 'Recurso no encontrado' }, { status: 404 });
    }
    if (error.code === 'P2003') {
      return NextResponse.json(
        { error: 'No se puede completar: hay registros relacionados que lo impiden' },
        { status: 409 }
      );
    }
  }

  logger.error('[api] Error no controlado', error);
  return NextResponse.json({ error: mensajePorDefecto }, { status: 500 });
}
