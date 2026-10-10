import { tiempoRelativo } from '@/shared/utilidades/fechas';

// "Hace cuanto" del Dashboard (actividad reciente y solicitudes abiertas).
describe('tiempoRelativo', () => {
  const ahora = new Date('2026-10-07T15:00:00Z');
  const hace = (ms: number) => new Date(ahora.getTime() - ms);
  const MIN = 60_000;
  const HORA = 60 * MIN;
  const DIA = 24 * HORA;

  it('cuenta en minutos, horas y días', () => {
    expect(tiempoRelativo(hace(20_000), ahora)).toBe('justo ahora');
    expect(tiempoRelativo(hace(5 * MIN), ahora)).toBe('hace 5 min');
    expect(tiempoRelativo(hace(3 * HORA), ahora)).toBe('hace 3 h');
    expect(tiempoRelativo(hace(DIA + HORA), ahora)).toBe('ayer');
    expect(tiempoRelativo(hace(4 * DIA), ahora)).toBe('hace 4 días');
  });

  it('pasada una semana muestra la fecha', () => {
    expect(tiempoRelativo(hace(10 * DIA), ahora)).toMatch(/\d{2}.\d{2}.\d{4}/);
  });

  it('una fecha vacía o inválida da texto vacío, y una futura no da números negativos', () => {
    expect(tiempoRelativo(null, ahora)).toBe('');
    expect(tiempoRelativo('no es fecha', ahora)).toBe('');
    expect(tiempoRelativo(new Date(ahora.getTime() + HORA), ahora)).toBe('justo ahora');
  });
});
