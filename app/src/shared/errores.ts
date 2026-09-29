/**
 * Errores de dominio con su codigo HTTP.
 *
 * Viven aparte del guard (que arrastra next-auth y la config de sesion) para
 * que la capa de servicios pueda lanzarlos sin importar nada de autenticacion.
 * `handleApiError` los traduce a la respuesta final; cualquier Error suelto
 * termina como 500, que es justo lo que estas clases evitan.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class UnauthorizedError extends ApiError {
  constructor(message = 'No autorizado') {
    super(401, message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends ApiError {
  constructor(message = 'No tienes permisos para realizar esta acción') {
    super(403, message);
    this.name = 'ForbiddenError';
  }
}

export class NotFoundError extends ApiError {
  constructor(message = 'Recurso no encontrado') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

/** Error de regla de negocio: la peticion es valida pero el estado no lo permite. */
export class ConflictError extends ApiError {
  constructor(message: string, details?: unknown) {
    super(409, message, details);
    this.name = 'ConflictError';
  }
}

/**
 * Conflicto de un campo del formulario (409). Lleva el campo para que la
 * pantalla lo marque en rojo (SPEC 2.102), como los errores que detecta ella
 * misma.
 */
export function errorDeCampo(campo: string, mensaje: string): ConflictError {
  return new ConflictError(mensaje, [{ field: campo, message: mensaje }]);
}

/** Valor que ya existe en otro registro (nombre, codigo, email, RUT...). */
export const errorRepetido = errorDeCampo;

/**
 * Errores por campo de una regla compartida con la pantalla (validarNuevaGuia,
 * validarRecepcion...): si hay alguno, 400 con el primero en el mensaje
 * (con su etiqueta legible) y todos en details, para marcarlos. Es la version
 * que lanza de respuestaErroresCampos, para usarla en los servicios.
 */
export function exigirSinErroresCampos(errores: Record<string, string>, etiquetas: Record<string, string>) {
  const [primero] = Object.keys(errores);
  if (!primero) return;
  throw new ValidationError(
    `${etiquetas[primero] ?? primero}: ${errores[primero]}`,
    Object.entries(errores).map(([field, message]) => ({ field, message }))
  );
}

export class ValidationError extends ApiError {
  constructor(message = 'Datos inválidos', details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}
