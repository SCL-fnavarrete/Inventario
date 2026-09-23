import {
  condicionCargadorSchema,
  etiquetaCondicionCargador,
  opcionesCondicionCargador,
} from '@/lib/constants/condicionCargador';

describe('condicionCargador', () => {
  test('etiquetas de entrega', () => {
    expect(etiquetaCondicionCargador('operativo', 'entrega')).toBe('Operativo');
    expect(etiquetaCondicionCargador('con_danos', 'entrega')).toBe('Con daños');
    expect(etiquetaCondicionCargador('no_incluido', 'entrega')).toBe('No incluido');
  });

  test('en devolucion "no_incluido" se muestra como No devuelto', () => {
    expect(etiquetaCondicionCargador('no_incluido', 'devolucion')).toBe('No devuelto');
  });

  test('sin dato o valor desconocido devuelve null', () => {
    expect(etiquetaCondicionCargador(null, 'entrega')).toBeNull();
    expect(etiquetaCondicionCargador(undefined, 'entrega')).toBeNull();
    expect(etiquetaCondicionCargador('ok', 'entrega')).toBeNull();
  });

  test('el schema rechaza los nombres antiguos', () => {
    for (const viejo of ['ok', 'danado', 'no_aplica', 'pendiente']) {
      expect(condicionCargadorSchema.safeParse(viejo).success).toBe(false);
    }
    expect(condicionCargadorSchema.safeParse('operativo').success).toBe(true);
  });

  test('opciones en orden', () => {
    expect(opcionesCondicionCargador('devolucion').map((o) => o.label)).toEqual([
      'Operativo',
      'Con daños',
      'No devuelto',
    ]);
  });
});
