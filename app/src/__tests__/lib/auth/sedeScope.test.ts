// La sede es un dato, no un candado (SPEC 2.117): todos ven y trabajan con
// todas las sedes; la del navbar solo filtra.
import { filtroSede, sedeIdParaCrear } from '@/lib/auth/sedeScope';

describe('filtroSede', () => {
  test('con una sede elegida filtra por ella; sin sede, trae todas', () => {
    expect(filtroSede('conce')).toEqual({ sedeId: 'conce' });
    expect(filtroSede(null)).toEqual({});
    expect(filtroSede('')).toEqual({});
  });
});

describe('sedeIdParaCrear', () => {
  test('usa la sede elegida en el formulario, sea cual sea el usuario', () => {
    expect(sedeIdParaCrear('stgo')).toBe('stgo');
    expect(sedeIdParaCrear('conce', { requerido: true })).toBe('conce');
  });

  test('donde es obligatoria, sin sede responde 400', () => {
    expect(() => sedeIdParaCrear(null, { requerido: true })).toThrow('Debes seleccionar una sede.');
    expect(sedeIdParaCrear(undefined)).toBeNull();
  });
});
