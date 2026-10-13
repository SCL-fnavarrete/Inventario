import { MENSAJE_SIN_CONEXION, mensajeDeError } from '@/shared/utilidades/apiErrors';

describe('mensajeDeError', () => {
  test('deja pasar el mensaje simple que mandó la API', () => {
    expect(mensajeDeError(new Error('El equipo ya está asignado'), 'Error')).toBe('El equipo ya está asignado');
  });

  test('sin conexión: aviso simple en vez de "Failed to fetch"', () => {
    expect(mensajeDeError(new TypeError('Failed to fetch'), 'Error')).toBe(MENSAJE_SIN_CONEXION);
  });

  test('respuesta que no es JSON o con datos internos: usa el mensaje de respaldo', () => {
    expect(mensajeDeError(new SyntaxError('Unexpected token < in JSON'), 'No se pudo guardar')).toBe('No se pudo guardar');
    expect(mensajeDeError(new Error('Invalid prisma.asset.findMany() invocation in C:/app/x.js'), 'No se pudo guardar')).toBe('No se pudo guardar');
  });

  test('algo que no es un Error usa el respaldo', () => {
    expect(mensajeDeError('boom', 'No se pudo guardar')).toBe('No se pudo guardar');
  });
});
