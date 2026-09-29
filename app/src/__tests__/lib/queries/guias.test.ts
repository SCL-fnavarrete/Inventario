// Filtros de guias de despacho (SPEC 2.108). Ver, recibir y anular ya no
// dependen de la sede (SPEC 2.117).

import { VISTAS_GUIA, whereActivosPorLlegar } from '@/modules/despachos/consultas';

describe('filtros de guias', () => {
  test('"Por recibir" son las en camino o con faltantes hacia la sede', () => {
    expect(VISTAS_GUIA.por_recibir('conce')).toEqual({
      estado: { in: ['en_transito', 'recibida_parcial'] },
      sedeDestinoId: 'conce',
    });
  });

  test('sin sede, "Por recibir" y "Por llegar" no traen nada', () => {
    expect(VISTAS_GUIA.por_recibir(null).sedeDestinoId).toBe('__sin_sede__');
    expect(whereActivosPorLlegar(null)).toMatchObject({
      dispatchItems: { some: { guide: { sedeDestinoId: '__sin_sede__' } } },
    });
  });

  test('"Por llegar" son equipos en transito en una guia abierta hacia la sede', () => {
    expect(whereActivosPorLlegar('conce')).toEqual({
      deletedAt: null,
      estado: 'en_transito',
      dispatchItems: {
        some: {
          estado: 'en_transito',
          guide: { sedeDestinoId: 'conce', estado: { in: ['en_transito', 'recibida_parcial'] } },
        },
      },
    });
  });
});
