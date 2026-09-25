// "Hoy" en hora de Chile (SPEC 2.86 y 2.94): de noche en Chile ya es manana
// en UTC, y los campos de fecha no deben proponer el dia siguiente.
import {
  ahoraParaInputFechaHora,
  formatearFechaConHora,
  hoyISO,
  inicioDeHoy,
  inputFechaHoraAISO,
} from '@/lib/utils/fechas';

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

describe('formatearFechaConHora (SPEC 2.98)', () => {
  test('agrega la hora cuando viene, sin correr el dia', () => {
    expect(formatearFechaConHora('2026-09-26T00:00:00.000Z', '14:30')).toBe('26-09-2026 a las 14:30');
  });

  test('sin hora queda solo la fecha; sin fecha, el texto de vacio', () => {
    expect(formatearFechaConHora('2026-09-26T00:00:00.000Z', null)).toBe('26-09-2026');
    expect(formatearFechaConHora(null, '14:30', '-')).toBe('-');
  });
});

describe('fecha y hora de un campo datetime-local (SPEC 2.104)', () => {
  test('ahoraParaInputFechaHora da la hora local, no la de Londres', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-09-25T13:30:00Z'));
    const esperado = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    expect(ahoraParaInputFechaHora()).toBe(esperado);
    expect(ahoraParaInputFechaHora()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  test('inputFechaHoraAISO convierte la hora local a un instante exacto', () => {
    const iso = inputFechaHoraAISO('2026-09-25T10:30');
    expect(iso).toBe(new Date('2026-09-25T10:30').toISOString());
    expect(inputFechaHoraAISO('')).toBeUndefined();
    expect(inputFechaHoraAISO('no-es-fecha')).toBeUndefined();
  });
});
