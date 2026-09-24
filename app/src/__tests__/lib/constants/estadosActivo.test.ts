// Etiquetas legibles (SPEC 2.85, 2.86), regla de baja (SPEC 2.88) y de mantencion (SPEC 2.96).
import {
  etiquetaEstadoActivo,
  etiquetaEstadoDevolucion,
  etiquetaMotivoBaja,
  motivoSinBaja,
  motivoSinMantencion,
} from '@/lib/constants/estadosActivo';

describe('etiquetas legibles', () => {
  test('estado de devolucion', () => {
    expect(etiquetaEstadoDevolucion('danado')).toBe('Dañado');
    expect(etiquetaEstadoDevolucion('ok')).toBe('Buen estado');
    expect(etiquetaEstadoDevolucion('no_devuelto')).toBe('No devuelto');
  });

  test('estado del activo y motivo de baja', () => {
    expect(etiquetaEstadoActivo('en_mantencion')).toBe('En Mantención');
    expect(etiquetaMotivoBaja('falla_irreparable')).toBe('Falla irreparable');
  });

  test('un valor desconocido se devuelve tal cual', () => {
    expect(etiquetaEstadoDevolucion('otro')).toBe('otro');
    expect(etiquetaMotivoBaja('otro_valor')).toBe('otro_valor');
  });
});

describe('motivoSinBaja', () => {
  test('se puede dar de baja desde disponible o en mantencion', () => {
    expect(motivoSinBaja('disponible')).toBeNull();
    expect(motivoSinBaja('en_mantencion')).toBeNull();
  });

  test('asignado y no devuelto primero tienen que volver con una solicitud', () => {
    expect(motivoSinBaja('asignado')).toMatch(/devuélvelo con una solicitud/);
    expect(motivoSinBaja('no_devuelto')).toMatch(/recupéralo con una solicitud/);
  });

  test('baja y vendido ya no admiten baja', () => {
    expect(motivoSinBaja('baja')).toMatch(/Ya está dado de baja/);
    expect(motivoSinBaja('vendido')).toMatch(/Ya fue vendido/);
  });
});

describe('motivoSinMantencion', () => {
  test('disponible, asignado y en mantencion admiten mantenciones', () => {
    expect(motivoSinMantencion('disponible')).toBeNull();
    expect(motivoSinMantencion('asignado')).toBeNull();
    expect(motivoSinMantencion('en_mantencion')).toBeNull();
  });

  test('no devuelto, baja y vendido no, con el motivo en palabras', () => {
    expect(motivoSinMantencion('no_devuelto')).toMatch(/recupéralo con una solicitud/);
    expect(motivoSinMantencion('baja')).toMatch(/dado de baja/);
    expect(motivoSinMantencion('vendido')).toMatch(/vendido/);
  });
});
