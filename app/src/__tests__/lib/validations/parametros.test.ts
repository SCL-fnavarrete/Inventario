// Reglas de Configuracion > Parametros, compartidas por pantalla y servidor (SPEC 2.102).
import { validarParametros } from '@/lib/validations/parametros';
import { esCorreoValido } from '@/lib/utils/text';

describe('validarParametros', () => {
  test('los datos de la empresa son opcionales', () => {
    expect(validarParametros({ empresaRut: '', empresaEmail: '' })).toEqual({});
  });

  test('RUT con digito verificador malo y email mal escrito se marcan por campo', () => {
    const e = validarParametros({ empresaRut: '76.123.456-1', empresaEmail: 'contacto@' });
    expect(e.empresaRut).toMatch(/dígito verificador/);
    expect(e.empresaEmail).toBe('El email no es válido');
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
