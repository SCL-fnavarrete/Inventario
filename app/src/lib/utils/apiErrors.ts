/**
 * Manejo unificado de errores de API en formularios (14-sep-2026, SPEC 2.37,
 * pedido explicito de Javier: "si hay error en un campo debe indicar el
 * error, el tipo de error y cual es el campo que genero ese error").
 *
 * Antes de esto, casi todos los formularios (22 pantallas, ver SPEC 2.37)
 * ignoraban `details` en la respuesta de error y mostraban un mensaje
 * generico ("Datos invalidos" / "Error al crear X"), aunque el backend ya
 * mandaba el detalle util en la mayoria de los casos (issues de Zod). El
 * unico lugar que lo hacia bien era `solicitudes/nueva/page.tsx`, pero con
 * el parseo copiado dentro de ese archivo. Esto lo saca a un lugar comun.
 *
 * Formato que entienden estas funciones (ver tambien src/lib/auth/guard.ts):
 *   - Nuevo formato uniforme (preferido): `details: { field: string, message: string }[]`
 *   - Formato viejo de Zod (`error.issues` sin transformar): `details: { path: (string|number)[], message: string }[]`
 * Se soportan ambos a proposito: no todas las rutas se migraron al formato
 * nuevo en el mismo cambio (ver guard.ts), y este parser no debe romper si
 * una ruta vieja todavia manda el formato de Zod tal cual.
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
