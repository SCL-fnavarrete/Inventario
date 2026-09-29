/**
 * Manejo unificado de errores de API en formularios: parsea `details` de la
 * respuesta de error a un mapa campo -> mensaje para mostrarlo junto al
 * campo que lo genero.
 *
 * Formato que entienden estas funciones (ver tambien src/shared/auth/guard.ts):
 *   - Nuevo formato uniforme (preferido): `details: { field: string, message: string }[]`
 *   - Formato viejo de Zod (`error.issues` sin transformar): `details: { path: (string|number)[], message: string }[]`
 * Se soportan ambos porque no todas las rutas usan el formato nuevo.
 */

export type FieldErrors = Record<string, string>;

interface ApiErrorBody {
  error?: string;
  details?: unknown;
}

/** Convierte `details` (en cualquiera de los dos formatos soportados) a un mapa campo -> mensaje. */
export function parseFieldErrors(details: unknown): FieldErrors {
  const result: FieldErrors = {};
  if (!Array.isArray(details)) return result;

  for (const item of details) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;

    let field: string | undefined;
    if (typeof obj.field === 'string') {
      // Formato nuevo: { field, message }
      field = obj.field;
    } else if (Array.isArray(obj.path)) {
      // Formato de Zod sin transformar: { path: [...], message }
      field = obj.path.join('.');
    }

    const message = typeof obj.message === 'string' ? obj.message : undefined;
    if (field && message) {
      result[field] = message;
    }
  }

  return result;
}

/**
 * Lee la respuesta de error de un `fetch` a la API y devuelve el mensaje
 * general junto con los errores por campo ya parseados. Uso tipico:
 *
 *   if (!res.ok) {
 *     const { message, fieldErrors } = await parseApiError(res, "Error al crear activo");
 *     setError(message);
 *     setFieldErrors(fieldErrors);
 *     return;
 *   }
 */
export async function parseApiError(
  res: Response,
  fallback: string
): Promise<{ message: string; fieldErrors: FieldErrors }> {
  let body: ApiErrorBody | null = null;
  try {
    body = await res.json();
  } catch {
    // Respuesta sin JSON (ej. error de red/proxy) -- se usa el fallback.
  }

  const fieldErrors = parseFieldErrors(body?.details);
  const message = body?.error || fallback;

  return { message, fieldErrors };
}
