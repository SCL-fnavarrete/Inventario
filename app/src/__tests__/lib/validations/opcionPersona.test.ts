import { nombresDeLista, opcionPersonaSchema, tipoOpcionPersonaSchema } from '@/modules/personas';

describe('opciones de la persona (SPEC 2.142)', () => {
  test('el nombre se recorta y no puede ir vacío ni llevar comas', () => {
    expect(opcionPersonaSchema.parse({ nombre: '  SCL Masivo ' }).nombre).toBe('SCL Masivo');
    expect(opcionPersonaSchema.safeParse({ nombre: '   ' }).success).toBe(false);
    expect(opcionPersonaSchema.safeParse({ nombre: 'A, B' }).success).toBe(false);
    expect(opcionPersonaSchema.safeParse({ nombre: 'x'.repeat(101) }).success).toBe(false);
  });

  test('solo existen los cinco tipos', () => {
    for (const t of ['supervisor', 'division', 'area', 'sub_area', 'lista_distribucion']) {
      expect(tipoOpcionPersonaSchema.safeParse(t).success).toBe(true);
    }
    expect(tipoOpcionPersonaSchema.safeParse('cargo').success).toBe(false);
  });

  test('una lista de distribución se separa por coma', () => {
    expect(nombresDeLista('SCL Masivo,  Corporativo ,')).toEqual(['SCL Masivo', 'Corporativo']);
    expect(nombresDeLista(null)).toEqual([]);
    expect(nombresDeLista('')).toEqual([]);
  });
});
