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
  constructor(message = 'No tienes permisos para realizar esta accion') {
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

export class ValidationError extends ApiError {
  constructor(message = 'Datos invalidos', details?: unknown) {
    super(400, message, details);
    this.name = 'ValidationError';
  }
}
