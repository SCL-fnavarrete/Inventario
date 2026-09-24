import { coincideBusqueda, coincidePorPalabras, removeAccents } from '@/lib/utils/text';

describe('removeAccents', () => {
  test('quita tildes y pasa a minusculas', () => {
    expect(removeAccents('César González')).toBe('cesar gonzalez');
  });
});

describe('coincidePorPalabras', () => {
  const persona = ['Juan', 'Pérez', 'Soto', 'juan.perez@scl.cl'];

  test('encuentra el nombre completo repartido en varios campos', () => {
    expect(coincidePorPalabras('juan perez', persona)).toBe(true);
  });

  test('no distingue acentos ni mayusculas', () => {
    expect(coincidePorPalabras('JUAN PÉREZ', persona)).toBe(true);
  });

  test('cada palabra debe aparecer en algun campo', () => {
    expect(coincidePorPalabras('juan gonzalez', persona)).toBe(false);
  });

  test('ignora campos vacios y un termino de solo espacios', () => {
    expect(coincidePorPalabras('perez', [null, undefined, 'Pérez'])).toBe(true);
    expect(coincidePorPalabras('   ', persona)).toBe(true);
  });
});

describe('coincideBusqueda', () => {
  test('encuentra por RUT con o sin puntos y guion', () => {
    const datos = { rut: '12.345.678-9', campos: ['Ana'] };
    expect(coincideBusqueda('12345678', datos)).toBe(true);
    expect(coincideBusqueda('12.345.678-9', datos)).toBe(true);
  });

  test('una letra suelta no calza con un RUT terminado en K', () => {
    expect(coincideBusqueda('k', { rut: '11.111.111-K', campos: ['Ana'] })).toBe(false);
  });

  test('sin RUT, busca por palabras en los campos', () => {
    expect(coincideBusqueda('ana rojas', { rut: null, campos: ['Ana', 'Rojas'] })).toBe(true);
  });
});
