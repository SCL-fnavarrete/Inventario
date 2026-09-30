import { sugerirUsuario } from '@/modules/configuracion';
import { nombreConUsuario } from '@/shared/auth/usuario';

// SPEC 2.122: el usuario se arma solo con el nombre completo.
describe('sugerirUsuario', () => {
  test('con 4 palabras o más, el apellido es la tercera', () => {
    expect(sugerirUsuario('Javier Andrés Soto Jaque')).toBe('jsoto');
    expect(sugerirUsuario('María José Pérez de la Fuente')).toBe('mperez');
  });

  test('con 2 o 3 palabras, el apellido es la segunda', () => {
    expect(sugerirUsuario('Javier Soto')).toBe('jsoto');
    expect(sugerirUsuario('Javier Soto Jaque')).toBe('jsoto');
  });

  test('sin tildes, ñ ni símbolos, y en minúsculas', () => {
    expect(sugerirUsuario('  ÁNGEL   Muñoz  ')).toBe('amunoz');
    expect(sugerirUsuario("Pedro O'Higgins")).toBe('pohiggins');
  });

  test('si ya existe, le agrega un número', () => {
    expect(sugerirUsuario('Javier Soto', ['jsoto'])).toBe('jsoto2');
    expect(sugerirUsuario('Javier Soto', ['JSoto', 'jsoto2'])).toBe('jsoto3');
  });

  test('sin nombre y apellido no sugiere nada', () => {
    expect(sugerirUsuario('')).toBe('');
    expect(sugerirUsuario('Javier')).toBe('');
  });
});

test('nombreConUsuario: "Nombre (usuario)", o lo que haya', () => {
  expect(nombreConUsuario('Javier Soto', 'jsoto')).toBe('Javier Soto (jsoto)');
  expect(nombreConUsuario(null, 'jsoto')).toBe('jsoto');
  expect(nombreConUsuario('Javier Soto', null)).toBe('Javier Soto');
  expect(nombreConUsuario(null, null)).toBe('');
});
