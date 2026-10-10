import {
  canTransitionAsset,
  getValidTransitions,
  getTransitionDescription,
  validateTransition,
  isTerminalState,
} from '@/modules/activos/maquinaEstados';
import { EstadoActivo } from '@prisma/client';

// SPEC: Sección 2.7 — Máquina de Estados del Ciclo de Vida de Activos

describe('assetStateMachine — canTransitionAsset', () => {
  // SPEC 2.7.2: Transiciones válidas
  const validTransitions: [EstadoActivo, EstadoActivo][] = [
    ['disponible', 'asignado'],
    ['disponible', 'en_mantencion'],
    // Baja sin uso previo: un equipo puede descartarse sin haber sido asignado.
    ['disponible', 'baja'],
    // SPEC 2.40: devolver en buen estado deja el equipo en disponible.
    ['asignado', 'disponible'],
    ['asignado', 'baja'],
    ['asignado', 'en_mantencion'],
    ['en_mantencion', 'disponible'],
    ['en_mantencion', 'asignado'],
    ['en_mantencion', 'baja'],
    // SPEC 2.111.4: solo si aparecio un equipo perdido en un despacho (precondicion).
    ['baja', 'disponible'],
    // 20-sep-2026 (SPEC 2.57): desvinculacion sin devolucion del equipo.
    ['asignado', 'no_devuelto'],
    ['no_devuelto', 'disponible'],
    ['no_devuelto', 'baja'],
    // SPEC 2.87: recuperado danado, pasa a evaluacion.
    ['no_devuelto', 'en_mantencion'],
  ];

  test.each(validTransitions)('%s → %s es válida', (from, to) => {
    expect(canTransitionAsset(from, to)).toBe(true);
  });

  // Transiciones inválidas
  const invalidTransitions: [EstadoActivo, EstadoActivo][] = [
    ['baja', 'asignado'],
    ['baja', 'en_mantencion'],
    ['disponible', 'no_devuelto'],
    ['en_mantencion', 'no_devuelto'],
    ['no_devuelto', 'asignado'],
  ];

  test.each(invalidTransitions)('%s → %s es inválida', (from, to) => {
    expect(canTransitionAsset(from, to)).toBe(false);
  });
});

describe('assetStateMachine — getValidTransitions', () => {
  test('disponible puede ir a asignado, en_mantencion, baja y en_transito', () => {
    expect(getValidTransitions('disponible')).toEqual(['asignado', 'en_mantencion', 'baja', 'en_transito']);
  });

  // SPEC 2.108: un equipo en transito llega (disponible) o se pierde (baja).
  // SPEC 2.111.5: si se anula el despacho de un reparto, vuelve a por repartir.
  test('en_transito puede ir a disponible, baja y por_repartir', () => {
    expect(getValidTransitions('en_transito')).toEqual(['disponible', 'baja', 'por_repartir']);
  });

  // SPEC 2.111: recien comprado, solo sale al repartirlo.
  test('por_repartir solo puede ir a disponible o en_transito', () => {
    expect(getValidTransitions('por_repartir')).toEqual(['disponible', 'en_transito']);
  });

  test('asignado puede ir a disponible, baja, en_mantencion y no_devuelto', () => {
    expect(getValidTransitions('asignado')).toEqual([
      'disponible',
      'baja',
      'en_mantencion',
      'no_devuelto',
    ]);
  });

  test('no_devuelto puede ir a disponible, en_mantencion y baja', () => {
    expect(getValidTransitions('no_devuelto')).toEqual(['disponible', 'en_mantencion', 'baja']);
  });

  test('en_mantencion puede ir a disponible, asignado y baja', () => {
    expect(getValidTransitions('en_mantencion')).toEqual(['disponible', 'asignado', 'baja']);
  });

  test('baja solo vuelve a disponible si aparece un equipo perdido en un despacho', () => {
    expect(getValidTransitions('baja')).toEqual(['disponible']);
  });
});

describe('assetStateMachine — isTerminalState', () => {
  test('baja NO es estado terminal (puede volver si el equipo perdido aparece)', () => {
    expect(isTerminalState('baja')).toBe(false);
  });

  test('no_devuelto NO es estado terminal (se puede recuperar o dar por perdido)', () => {
    expect(isTerminalState('no_devuelto')).toBe(false);
  });

  test('disponible NO es estado terminal', () => {
    expect(isTerminalState('disponible')).toBe(false);
  });
});

describe('assetStateMachine — getTransitionDescription', () => {
  test('retorna descripción para transición válida', () => {
    expect(getTransitionDescription('disponible', 'asignado')).toBe('Asignar a empleado');
  });

  test('retorna mensaje por defecto para transición inválida', () => {
    expect(getTransitionDescription('baja', 'asignado')).toBe('Transición no válida');
  });
});

// SPEC 2.7.2: Precondiciones por transición
describe('assetStateMachine — validateTransition', () => {
  const baseContext = {
    hasActiveAssignment: false,
    hasActiveMaintenance: false,
  };

  test('transición válida sin precondiciones retorna valid=true', () => {
    const result = validateTransition('disponible', 'asignado', baseContext);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test('transición inválida retorna valid=false con error', () => {
    const result = validateTransition('baja', 'asignado', baseContext);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('no permitida');
  });

  // SPEC 2.7.3: asignado→baja requiere devolución con danado
  test('asignado→baja sin devolución danado es inválida', () => {
    const result = validateTransition('asignado', 'baja', {
      ...baseContext,
      hasActiveAssignment: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('devolución');
  });

  test('asignado→baja con devolución danado es válida', () => {
    const result = validateTransition('asignado', 'baja', {
      ...baseContext,
      hasActiveAssignment: true,
      estadoDevolucion: 'danado',
    });
    expect(result.valid).toBe(true);
  });

  // SPEC 2.7.7 / 2.40: asignado→disponible requiere devolución
  test('asignado→disponible sin devolución es inválida', () => {
    const result = validateTransition('asignado', 'disponible', {
      ...baseContext,
      hasActiveAssignment: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('devolución');
  });

  test('asignado→disponible con devolución danado es inválida (debe ir a mantención)', () => {
    const result = validateTransition('asignado', 'disponible', {
      ...baseContext,
      hasActiveAssignment: true,
      estadoDevolucion: 'danado',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('mantención');
  });

  test('asignado→disponible con devolución ok es válida', () => {
    const result = validateTransition('asignado', 'disponible', {
      ...baseContext,
      hasActiveAssignment: true,
      estadoDevolucion: 'ok',
    });
    expect(result.valid).toBe(true);
  });

  // SPEC 2.7.5: en_mantencion→baja requiere motivo
  test('en_mantencion→baja sin motivo es inválida', () => {
    const result = validateTransition('en_mantencion', 'baja', baseContext);
    expect(result.valid).toBe(false);
  });

  // SPEC 2.108: perdido en el despacho, baja por Extravio con motivo.
  test('en_transito→baja sin motivo es inválida', () => {
    expect(validateTransition('en_transito', 'baja', baseContext).valid).toBe(false);
  });

  test('en_transito→baja con motivo es válida', () => {
    expect(
      validateTransition('en_transito', 'baja', { ...baseContext, motivo: 'Extravío: no llegó' }).valid
    ).toBe(true);
  });

  test('por_repartir no se asigna, no va a mantención ni se da de baja', () => {
    expect(validateTransition('por_repartir', 'asignado', baseContext).valid).toBe(false);
    expect(validateTransition('por_repartir', 'en_mantencion', baseContext).valid).toBe(false);
    expect(validateTransition('por_repartir', 'baja', baseContext).valid).toBe(false);
  });

  test('repartir: por_repartir va a disponible o sale en un despacho', () => {
    expect(validateTransition('por_repartir', 'disponible', baseContext).valid).toBe(true);
    expect(validateTransition('por_repartir', 'en_transito', baseContext).valid).toBe(true);
  });

  // SPEC 2.111.4: una baja solo se revierte desde el despacho donde se perdio.
  test('baja→disponible sin haber aparecido en un despacho es inválida', () => {
    const r = validateTransition('baja', 'disponible', baseContext);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toMatch(/despacho/);
  });

  test('baja→disponible de un equipo que apareció en su despacho es válida', () => {
    expect(validateTransition('baja', 'disponible', { ...baseContext, aparecioEnDespacho: true }).valid).toBe(true);
  });

  test('en_transito no puede asignarse ni ir a mantención', () => {
    expect(validateTransition('en_transito', 'asignado', baseContext).valid).toBe(false);
    expect(validateTransition('en_transito', 'en_mantencion', baseContext).valid).toBe(false);
  });

  test('en_mantencion→baja con motivo es válida', () => {
    const result = validateTransition('en_mantencion', 'baja', {
      ...baseContext,
      motivo: 'no_reparable',
    });
    expect(result.valid).toBe(true);
  });

});

// Auditoria 27-sep-2026 (5.1-A): transiciones con precondicion de motivo que
// no tenian test y dejaban el CI bajo el umbral de cobertura.
describe('assetStateMachine — motivo obligatorio', () => {
  const sinAsignacion = { hasActiveAssignment: false, hasActiveMaintenance: false };
  const casos: [EstadoActivo, EstadoActivo, RegExp][] = [
    ['disponible', 'baja', /motivo obligatorio para dar de baja/],
    ['asignado', 'no_devuelto', /motivo/],
    ['no_devuelto', 'disponible', /cómo se recuperó/],
    ['no_devuelto', 'baja', /dar por perdido/],
  ];

  test.each(casos)('%s → %s sin motivo se rechaza', (de, a, mensaje) => {
    const r = validateTransition(de, a, sinAsignacion);
    expect(r.valid).toBe(false);
    expect(r.errors.join(' ')).toMatch(mensaje);
  });

  test.each(casos)('%s → %s con motivo se acepta', (de, a) => {
    const r = validateTransition(de, a, { ...sinAsignacion, motivo: 'motivo de prueba' });
    expect(r.valid).toBe(true);
  });
});
