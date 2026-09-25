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
 * `requirePermission()` y cierra con `handleApiError()`.
 *
 * Formato unificado de error: `{ error: string, details?: unknown }`, para
 * que el cliente siempre encuentre la clave que espera en vez de caer al
 * mensaje generico por defecto.
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
  errorRepetido,
  errorDeCampo,
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

/** Un error asociado a un campo especifico de un formulario. */
export interface CampoError {
  field: string;
  message: string;
}

/**
 * Convierte los `issues` de un ZodError al formato uniforme que espera el
 * frontend: cada issue queda como `{ field, message }`, donde `field` es
 * el path unido con "." (ej. "categoriaId", o "assets.0.assetId" para un
 * array anidado).
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
 * Respuesta unificada para cuando `schema.safeParse(body)` falla, con
 * `details` en el formato `{ field, message }[]` que entiende
 * `parseApiError` en el frontend (`src/lib/utils/apiErrors.ts`).
 */
export function respuestaDatosInvalidos(error: ZodError): NextResponse<CuerpoError> {
  return NextResponse.json(
    { error: 'Datos inválidos', details: zodIssuesToCampoErrores(error.issues) },
    { status: 400 }
  );
}

/**
 * 400 con los errores por campo de una regla compartida con la pantalla
 * (validarParametros, validarNuevaGuia...). El mensaje general nombra el
 * primero con su etiqueta legible; details lleva todos, para marcarlos.
 * null si no hay errores.
 */
export function respuestaErroresCampos(
  errores: Record<string, string>,
  etiquetas: Record<string, string>
): NextResponse<CuerpoError> | null {
  const [primero] = Object.keys(errores);
  if (!primero) return null;
  return NextResponse.json(
    {
      error: `${etiquetas[primero] ?? primero}: ${errores[primero]}`,
      details: Object.entries(errores).map(([field, message]) => ({ field, message })),
    },
    { status: 400 }
  );
}

/** Nombre legible de los campos unicos, para el mensaje de dato repetido (P2002). */
const ETIQUETA_CAMPO_UNICO: Record<string, string> = {
  correo_personal: 'correo personal',
  correoPersonal: 'correo personal',
  correo_empresa: 'correo de empresa',
  correoEmpresa: 'correo de empresa',
  rut: 'RUT',
  numero_serie: 'N° de serie',
  numeroSerie: 'N° de serie',
  numero: 'número',
  nombre: 'nombre',
  email: 'correo',
  codigo: 'código',
};

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
      // Nombre legible del campo; el de Prisma es el interno ("correo_personal").
      const campos = camposArr.map((c) => ETIQUETA_CAMPO_UNICO[c] ?? c).join(', ');
      return NextResponse.json(
        {
          error: campos
            ? `Ya existe un registro con ese valor en: ${campos}`
            : 'Ya existe un registro con ese valor único',
          // Prisma no da un mensaje por campo especifico, pero se identifica
          // cual campo duplicado es, para que el frontend lo marque en el
          // formulario.
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
