// Quien ve y que puede hacer cada sede con una guia de despacho (SPEC 2.108).
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  VISTAS_GUIA,
  puedeAnularGuia,
  puedeConfirmarRecepcion,
  puedeVerGuia,
  sedePropiaGuias,
  whereActivosPorLlegar,
  whereGuiaVisible,
} from '@/lib/queries/guias';
import type { SesionAutenticada } from '@/lib/auth/guard';

const sesion = (role: string, sedeId: string | null) =>
  ({ user: { id: 'u', email: 'qa@scl.cl', role, sedeId } }) as unknown as SesionAutenticada;

const admin = sesion('admin', null);
const origen = sesion('tecnico', 'stgo');
const destino = sesion('tecnico', 'conce');
const otra = sesion('tecnico', 'arica');
const guia = { sedeId: 'stgo', sedeDestinoId: 'conce' };

describe('permisos de una guia', () => {
  test('la ven admin, la sede que despacha y la que recibe; otra sede no', () => {
    expect(puedeVerGuia(admin, guia)).toBe(true);
    expect(puedeVerGuia(origen, guia)).toBe(true);
    expect(puedeVerGuia(destino, guia)).toBe(true);
    expect(puedeVerGuia(otra, guia)).toBe(false);
  });

  test('solo la sede destino (o admin) confirma la recepcion', () => {
    expect(puedeConfirmarRecepcion(destino, guia)).toBe(true);
    expect(puedeConfirmarRecepcion(admin, guia)).toBe(true);
    expect(puedeConfirmarRecepcion(origen, guia)).toBe(false);
  });

  test('solo la sede que despacho (o admin) anula', () => {
    expect(puedeAnularGuia(origen, guia)).toBe(true);
    expect(puedeAnularGuia(admin, guia)).toBe(true);
    expect(puedeAnularGuia(destino, guia)).toBe(false);
  });

  test('un tecnico sin sede no ve guias ajenas', () => {
    expect(puedeVerGuia(sesion('tecnico', null), { sedeId: null, sedeDestinoId: 'conce' })).toBe(false);
  });
});

describe('filtros de guias', () => {
  test('el tecnico ve las guias que salen o llegan a su sede; admin todas', () => {
    expect(whereGuiaVisible(admin)).toEqual({});
    expect(whereGuiaVisible(destino)).toEqual({ OR: [{ sedeId: 'conce' }, { sedeDestinoId: 'conce' }] });
  });

  test('"mi sede": la propia del tecnico; para admin la elegida en el menu', () => {
    expect(sedePropiaGuias(destino, 'stgo')).toBe('conce');
    expect(sedePropiaGuias(admin, 'stgo')).toBe('stgo');
    expect(sedePropiaGuias(admin, null)).toBeNull();
  });

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
