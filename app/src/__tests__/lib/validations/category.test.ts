import { createCategorySchema, updateCategorySchema } from '@/lib/validations/category';

describe('Category Validation', () => {
  test('normaliza y acepta el tipo de devolución estable al crear una categoría', () => {
    const result = createCategorySchema.safeParse({
      nombre: '  Laptop  ',
      descripcion: '  Equipos portátiles  ',
      requiereSerie: true,
      requiereImei: false,
      tipoDevolucion: 'notebook',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        nombre: 'Laptop',
        descripcion: 'Equipos portátiles',
        tipoDevolucion: 'notebook',
      });
    }
  });

  test.each([
    ['creación', createCategorySchema],
    ['actualización', updateCategorySchema],
  ])('rechaza un tipo de devolución inválido en %s', (_operacion, schema) => {
    const result = schema.safeParse({
      nombre: 'Laptop',
      tipoDevolucion: 'impresora',
    });

    expect(result.success).toBe(false);
  });
});
