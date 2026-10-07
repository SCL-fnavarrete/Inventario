import { nombreDeMarca } from '@/modules/activos';

describe('nombreDeMarca', () => {
  it.each([
    ['DELL', 'DELL'],
    ['dell', 'Dell'],
    ['LENOVO', 'Lenovo'],
    ['  samsung   galaxy ', 'Samsung Galaxy'],
    ['HP', 'HP'],
    ['AOC', 'AOC'],
    ['TP-LINK', 'TP-LINK'],
    ['logitech', 'Logitech'],
    ['HyperX', 'HyperX'],
    ['iPhone', 'iPhone'],
  ])('%s -> %s', (entrada, esperado) => {
    expect(nombreDeMarca(entrada)).toBe(esperado);
  });

  it('es idempotente', () => {
    for (const m of ['Dell', 'HP', 'Lenovo', 'HyperX', 'TP-LINK']) expect(nombreDeMarca(nombreDeMarca(m))).toBe(nombreDeMarca(m));
  });
});
