// Etiquetas legibles (SPEC 2.85, 2.86), regla de baja (SPEC 2.88) y de mantencion (SPEC 2.96).
import {
  etiquetaEstadoActivo,
  etiquetaEstadoDevolucion,
  motivoSinBaja,
  motivoSinMantencion,
} from '@/modules/activos/estados';

describe('etiquetas legibles', () => {
  test('estado de devolucion', () => {
    expect(etiquetaEstadoDevolucion('danado')).toBe('Dañado');
    expect(etiquetaEstadoDevolucion('ok')).toBe('Buen estado');
    expect(etiquetaEstadoDevolucion('no_devuelto')).toBe('No devuelto');
  });

  test('estado del activo', () => {
    expect(etiquetaEstadoActivo('en_mantencion')).toBe('En Mantención');
  });

  test('un valor desconocido se devuelve tal cual', () => {
    expect(etiquetaEstadoDevolucion('otro')).toBe('otro');
  });
});

describe('motivoSinBaja (SPEC 2.106: solo un equipo sin empleado asignado)', () => {
  const sin = (estado: string) => motivoSinBaja({ estado, empleadoActualId: null });
  const con = (estado: string) => motivoSinBaja({ estado, empleadoActualId: 'emp-1' });

  test('disponible y en mantencion sin dueño (devuelto dañado) se pueden dar de baja', () => {
    expect(sin('disponible')).toBeNull();
    expect(sin('en_mantencion')).toBeNull();
  });

  test('en mantencion pero asignado a su dueño: no (este era el hueco)', () => {
    expect(con('en_mantencion')).toMatch(/Está asignado a un empleado/);
  });

  test('asignado y no devuelto primero tienen que volver con una solicitud', () => {
    expect(con('asignado')).toMatch(/devuélvelo con una solicitud/);
    expect(con('no_devuelto')).toMatch(/recupéralo con una solicitud/);
  });

  test('uno que ya está de baja no admite otra baja', () => {
    expect(sin('baja')).toMatch(/Ya está dado de baja/);
  });
});

describe('motivoSinMantencion', () => {
  test('disponible, asignado y en mantencion admiten mantenciones', () => {
    expect(motivoSinMantencion('disponible')).toBeNull();
    expect(motivoSinMantencion('asignado')).toBeNull();
    expect(motivoSinMantencion('en_mantencion')).toBeNull();
  });

  test('no devuelto y baja no, con el motivo en palabras', () => {
    expect(motivoSinMantencion('no_devuelto')).toMatch(/recupéralo con una solicitud/);
    expect(motivoSinMantencion('baja')).toMatch(/dado de baja/);
  });
});
