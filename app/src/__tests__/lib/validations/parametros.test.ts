// Reglas de Configuracion > Seguridad, compartidas por pantalla y servidor (SPEC 2.102, 2.112).
import { validarParametros } from '@/lib/validations/parametros';
import { esCorreoValido } from '@/lib/utils/text';

describe('validarParametros', () => {
  test('valores dentro de sus limites no tienen errores', () => {
    expect(validarParametros({ duracionSesionHoras: 24, maxIntentosLogin: 5, minutosBloqueoLogin: 15 })).toEqual({});
  });

  test('parametros de seguridad fuera de sus limites', () => {
    const e = validarParametros({ duracionSesionHoras: 999, maxIntentosLogin: 0, minutosBloqueoLogin: 15 });
    expect(e.duracionSesionHoras).toBe('Debe ser un número entero entre 1 y 720');
    expect(e.maxIntentosLogin).toBe('Debe ser un número entero entre 1 y 20');
    expect(e.minutosBloqueoLogin).toBeUndefined();
  });
});

describe('esCorreoValido', () => {
  test('acepta algo@dominio.cl y rechaza lo incompleto', () => {
    expect(esCorreoValido(' ana@scl.cl ')).toBe(true);
    expect(esCorreoValido('ana@scl')).toBe(false);
    expect(esCorreoValido('ana scl.cl')).toBe(false);
  });
});
