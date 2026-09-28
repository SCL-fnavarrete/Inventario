/**
 * Columnas que guardan el id interno de un usuario del sistema (SystemUser).
 * Ese id, junto con el secreto de sesion, basta para fabricar una sesion a
 * su nombre (auditoria 27-sep-2026, F1-01), y ninguna pantalla lo necesita:
 * muestran el nombre y el rol. Por eso no sale en las respuestas de la API.
 */
const CAMPOS_ID_USUARIO = new Set(['solicitanteId', 'responsableActualId', 'ejecutadoPorId', 'autorId', 'usuarioId']);

/** Copia del dato sin las columnas de CAMPOS_ID_USUARIO, en cualquier nivel. */
export function sinIdsDeUsuario<T>(dato: T): T {
  if (Array.isArray(dato)) return dato.map(sinIdsDeUsuario) as T;
  // Solo objetos planos: Date y Decimal (pulgadas, costo) se devuelven tal
  // cual para que conserven su forma al pasar a JSON.
  const proto = dato && typeof dato === 'object' ? Object.getPrototypeOf(dato) : undefined;
  if (proto === Object.prototype || proto === null) {
    const limpio: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(dato as Record<string, unknown>)) {
      if (!CAMPOS_ID_USUARIO.has(clave)) limpio[clave] = sinIdsDeUsuario(valor);
    }
    return limpio as T;
  }
  return dato;
}
