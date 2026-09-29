// Reglas compartidas de mantenciones (SPEC 2.96, 2.98, 2.100).
import { avisoFechaPasada, estaVencida, mantencionACerrar } from '@/modules/mantenciones/utilidades';

afterEach(() => {
  jest.useRealTimers();
});

describe('estaVencida', () => {
  beforeEach(() => {
    // 23:30 del 24-sep en Chile (ya 25-sep en UTC).
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T02:30:00Z'));
  });

  test('pendiente con la fecha pasada: vencida', () => {
    expect(estaVencida({ estado: 'pendiente', fechaProgramada: '2026-09-23T00:00:00.000Z' })).toBe(true);
  });

  test('la de hoy en Chile no esta vencida, aunque en UTC ya sea manana', () => {
    expect(estaVencida({ estado: 'pendiente', fechaProgramada: '2026-09-24T00:00:00.000Z' })).toBe(false);
  });

  test('una en proceso o cerrada nunca esta vencida; sin fecha tampoco', () => {
    expect(estaVencida({ estado: 'en_proceso', fechaProgramada: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(estaVencida({ estado: 'completada', fechaProgramada: '2026-01-01T00:00:00.000Z' })).toBe(false);
    expect(estaVencida({ estado: 'pendiente', fechaProgramada: null })).toBe(false);
  });
});

describe('mantencionACerrar', () => {
  test('prefiere la en proceso aunque haya una pendiente mas antigua', () => {
    const abiertas = [{ id: 'vieja', estado: 'pendiente' }, { id: 'curso', estado: 'en_proceso' }];
    expect(mantencionACerrar(abiertas)?.id).toBe('curso');
  });

  test('sin una en proceso, la pendiente mas antigua; sin abiertas, ninguna', () => {
    expect(mantencionACerrar([{ id: 'a', estado: 'pendiente' }, { id: 'b', estado: 'pendiente' }])?.id).toBe('a');
    expect(mantencionACerrar([])).toBeUndefined();
  });
});

describe('avisoFechaPasada (SPEC 2.101)', () => {
  test('avisa solo si la fecha es anterior a hoy en Chile', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T02:30:00Z'));
    expect(avisoFechaPasada('2026-09-23')).toMatch(/quedará como vencida/);
    expect(avisoFechaPasada('2026-09-24')).toBeUndefined();
    expect(avisoFechaPasada('')).toBeUndefined();
  });
});
