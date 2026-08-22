/** Domain failures raised inside a Prisma transaction and translated by API routes. */
export class ServiceOperationError extends Error {
  constructor(
    public readonly status: 404 | 409,
    message: string
  ) {
    super(message);
    this.name = 'ServiceOperationError';
  }
}

export class ServiceNotFoundError extends ServiceOperationError {
  constructor(message: string) {
    super(404, message);
    this.name = 'ServiceNotFoundError';
  }
}

export class ServiceConflictError extends ServiceOperationError {
  constructor(message: string) {
    super(409, message);
    this.name = 'ServiceConflictError';
  }
}
