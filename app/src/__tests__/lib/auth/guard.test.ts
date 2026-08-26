/**
 * @jest-environment node
 *
 * `next/server` necesita las Web APIs globales (Request/Response), que el
 * entorno jsdom por defecto no expone. Node 22 sí las trae.
 */
import { ZodError, z } from 'zod';
import { Prisma } from '@prisma/client';
import {
  ApiError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
  handleApiError,
} from '@/lib/auth/guard';

/**
 * `handleApiError` es el traductor único de errores de la API.
 *
 * Lo que se fija aquí es el contrato de forma: **toda** respuesta de error
 * lleva la clave `error`. El bug documentado en CLAUDE.md era exactamente eso:
 * unas rutas mandaban `error`, otras `message`/`details`, y el cliente leía la
 * que no venía, así que mostraba siempre un mensaje genérico en vez del real.
 */

async function cuerpoDe(respuesta: Response) {
  return (await respuesta.json()) as { error?: string; details?: unknown };
}

describe('handleApiError — forma de la respuesta', () => {
  test.each([
    ['UnauthorizedError', new UnauthorizedError(), 401],
    ['ForbiddenError', new ForbiddenError(), 403],
    ['NotFoundError', new NotFoundError(), 404],
    ['ConflictError', new ConflictError('en conflicto'), 409],
    ['ValidationError', new ValidationError(), 400],
    ['ApiError 418', new ApiError(418, 'soy una tetera'), 418],
  ])('%s responde con su status', async (_nombre, error, status) => {
    const res = handleApiError(error);
    expect(res.status).toBe(status);
  });

  test('siempre incluye la clave `error` con texto', async () => {
    for (const error of [
      new UnauthorizedError(),
      new ForbiddenError(),
      new NotFoundError(),
      new ConflictError('x'),
      new ValidationError(),
      new Error('cualquier cosa'),
    ]) {
      const cuerpo = await cuerpoDe(handleApiError(error));
      expect(typeof cuerpo.error).toBe('string');
      expect(cuerpo.error!.length).toBeGreaterThan(0);
    }
  });

  test('omite `details` cuando no hay detalles', async () => {
    const cuerpo = await cuerpoDe(handleApiError(new NotFoundError()));
    expect(cuerpo).not.toHaveProperty('details');
  });

  test('incluye `details` cuando el error los trae', async () => {
    const cuerpo = await cuerpoDe(
      handleApiError(new ConflictError('tiene historial', { eventos: 3 }))
    );
    expect(cuerpo.error).toBe('tiene historial');
    expect(cuerpo.details).toEqual({ eventos: 3 });
  });
});

describe('handleApiError — errores de validación', () => {
  test('un ZodError se traduce a 400 con las issues como details', async () => {
    const esquema = z.object({ marca: z.string() });
    let capturado: ZodError | null = null;
    try {
      esquema.parse({ marca: 42 });
    } catch (e) {
      capturado = e as ZodError;
    }

    const res = handleApiError(capturado);
    expect(res.status).toBe(400);
    const cuerpo = await cuerpoDe(res);
    expect(cuerpo.error).toBe('Datos invalidos');
    expect(Array.isArray(cuerpo.details)).toBe(true);
  });
});

describe('handleApiError — errores de Prisma', () => {
  function errorPrisma(code: string, meta?: Record<string, unknown>) {
    return new Prisma.PrismaClientKnownRequestError('fallo', {
      code,
      clientVersion: '5.22.0',
      meta,
    });
  }

  test('P2002 (unico duplicado) responde 409 nombrando el campo', async () => {
    const res = handleApiError(errorPrisma('P2002', { target: ['numero_serie'] }));
    expect(res.status).toBe(409);
    const cuerpo = await cuerpoDe(res);
    expect(cuerpo.error).toContain('numero_serie');
  });

  test('P2025 (no encontrado) responde 404', async () => {
    expect(handleApiError(errorPrisma('P2025')).status).toBe(404);
  });

  test('P2003 (clave foránea) responde 409', async () => {
    expect(handleApiError(errorPrisma('P2003')).status).toBe(409);
  });
});

describe('handleApiError — fallo genérico', () => {
  test('un error desconocido responde 500', async () => {
    expect(handleApiError(new Error('boom')).status).toBe(500);
  });

  test('conserva el mensaje por defecto de la ruta', async () => {
    const cuerpo = await cuerpoDe(
      handleApiError(new Error('boom'), 'Error al obtener activos')
    );
    expect(cuerpo.error).toBe('Error al obtener activos');
  });

  test('sin mensaje por defecto no filtra el error interno', async () => {
    const cuerpo = await cuerpoDe(handleApiError(new Error('conexión a 10.0.0.5 falló')));
    expect(cuerpo.error).toBe('Error interno del servidor');
    expect(cuerpo.error).not.toContain('10.0.0.5');
  });

  test('el mensaje por defecto no pisa el de un ApiError', async () => {
    const cuerpo = await cuerpoDe(
      handleApiError(new ConflictError('el activo está asignado'), 'Error al eliminar activo')
    );
    expect(cuerpo.error).toBe('el activo está asignado');
  });
});
