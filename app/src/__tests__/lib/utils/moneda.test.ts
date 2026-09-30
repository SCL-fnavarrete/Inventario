import { formatearClp, leerClp } from '@/shared/utilidades/moneda';
import { createAssetSchema, updateAssetSchema } from '@/modules/activos/validaciones';

// SPEC 2.124: valor del equipo en pesos chilenos.
describe('formatearClp / leerClp', () => {
  test('muestra con puntos de miles y signo peso', () => {
    expect(formatearClp(850000)).toBe('$850.000');
    expect(formatearClp(0)).toBe('$0');
    expect(formatearClp(null)).toBe('—');
  });

  test('lee lo que se escribe a mano', () => {
    expect(leerClp('850000')).toBe(850000);
    expect(leerClp('850.000')).toBe(850000);
    expect(leerClp(' $ 850.000 ')).toBe(850000);
    expect(leerClp('')).toBeNull();
    expect(leerClp(null)).toBeNull();
    expect(leerClp(1200)).toBe(1200);
    expect(leerClp('850,5')).toBeNaN();
    expect(leerClp('mil')).toBeNaN();
  });
});

describe('valor en el schema del activo', () => {
  const base = { categoriaId: '550e8400-e29b-41d4-a716-446655440000', marca: 'Dell', modelo: 'X' };

  test('es opcional y acepta número o texto con puntos', () => {
    expect(createAssetSchema.parse(base).valor).toBeUndefined();
    expect(createAssetSchema.parse({ ...base, valor: '$850.000' }).valor).toBe(850000);
    expect(updateAssetSchema.parse({ valor: 600000 }).valor).toBe(600000);
    expect(updateAssetSchema.parse({ valor: '' }).valor).toBeNull();
    expect(updateAssetSchema.parse({ valor: null }).valor).toBeNull();
  });

  test('editar solo el valor no inventa estado ni condición (equipos asignados)', () => {
    expect(updateAssetSchema.parse({ valor: 100000 })).toEqual({ valor: 100000 });
  });

  test('rechaza decimales, negativos, texto y montos sobre $999.999.999', () => {
    for (const valor of ['850,5', 12.5, -1, 'mil', 1_000_000_000]) {
      const r = updateAssetSchema.safeParse({ valor });
      expect(r.success).toBe(false);
      expect(r.error?.issues[0].path).toEqual(['valor']);
    }
  });
});
