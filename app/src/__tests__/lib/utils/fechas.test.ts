// "Hoy" en hora de Chile (SPEC 2.86 y 2.94): de noche en Chile ya es manana
// en UTC, y los campos de fecha no deben proponer el dia siguiente.
import { hoyISO, inicioDeHoy } from '@/lib/utils/fechas';

afterEach(() => {
  jest.useRealTimers();
});

describe('hoyISO / inicioDeHoy', () => {
  test('a las 22:30 del 23-sep en Chile (01:30 UTC del 24) sigue siendo 23', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-24T01:30:00Z'));
    expect(hoyISO()).toBe('2026-09-23');
    expect(inicioDeHoy().toISOString()).toBe('2026-09-23T00:00:00.000Z');
  });

  test('a mediodia no hay diferencia', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-23T15:00:00Z'));
    expect(hoyISO()).toBe('2026-09-23');
  });
});
