import { marcasNuevasDeFallos } from '@/modules/importacion';

const f = (fila: number, marca: string) => ({ fila, mensaje: `Marca no reconocida: "${marca}". Selecciona una opción del catálogo o créala.` });

describe('marcasNuevasDeFallos', () => {
  it('junta Aoc, AOC y aoc en una sola marca, con todas sus filas', () => {
    const r = marcasNuevasDeFallos([f(2, 'Aoc'), f(3, 'aoc'), f(4, 'Philips'), f(5, 'AOC')]);
    expect(r).toHaveLength(2);
    expect(r[0].filas).toEqual([2, 3, 5]);
    expect(r[1]).toEqual({ nombre: 'Philips', filas: [4] });
  });

  it('ignora los fallos que no son de marca', () => {
    expect(marcasNuevasDeFallos([{ fila: 2, mensaje: 'Campos faltantes: Modelo' }])).toEqual([]);
  });
});
