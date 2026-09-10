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
    return NextResponse.json(
      { error: 'Datos invalidos', details: error.issues },
      { status: 400 }
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2002') {
      const campos = (error.meta?.target as string[] | undefined)?.join(', ');
      return NextResponse.json(
        {
          error: campos
            ? `Ya existe un registro con ese valor en: ${campos}`
            : 'Ya existe un registro con ese valor unico',
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
