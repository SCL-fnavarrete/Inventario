import {
  canTransitionAsset,
  getValidTransitions,
  getTransitionDescription,
  validateTransition,
  isTerminalState,
} from '@/lib/services/assetStateMachine';
import { EstadoActivo } from '@prisma/client';

// SPEC: Sección 2.7 — Máquina de Estados del Ciclo de Vida de Activos

describe('assetStateMachine — canTransitionAsset', () => {
  // SPEC 2.7.2: Transiciones válidas
  const validTransitions: [EstadoActivo, EstadoActivo][] = [
    ['disponible', 'asignado'],
    ['disponible', 'en_mantencion'],
    // Baja sin uso previo: un equipo puede descartarse sin haber sido asignado.
    ['disponible', 'baja'],
    ['asignado', 'reutilizable'],
    ['asignado', 'baja'],
    ['asignado', 'en_mantencion'],
    ['en_mantencion', 'disponible'],
    ['en_mantencion', 'asignado'],
    ['en_mantencion', 'baja'],
    ['reutilizable', 'asignado'],
    ['reutilizable', 'disponible'],
    ['reutilizable', 'baja'],
    ['baja', 'vendido'],
  ];

  test.each(validTransitions)('%s → %s es válida', (from, to) => {
    expect(canTransitionAsset(from, to)).toBe(true);
  });

  // Transiciones inválidas
  const invalidTransitions: [EstadoActivo, EstadoActivo][] = [
    ['disponible', 'vendido'],
    ['disponible', 'reutilizable'],
    ['asignado', 'vendido'],
    ['asignado', 'disponible'],
    ['en_mantencion', 'vendido'],
    ['en_mantencion', 'reutilizable'],
    ['reutilizable', 'vendido'],
    ['reutilizable', 'en_mantencion'],
    ['baja', 'disponible'],
    ['baja', 'asignado'],
    ['baja', 'reutilizable'],
    ['baja', 'en_mantencion'],
    ['vendido', 'disponible'],
    ['vendido', 'asignado'],
    ['vendido', 'baja'],
  ];

  test.each(invalidTransitions)('%s → %s es inválida', (from, to) => {
    expect(canTransitionAsset(from, to)).toBe(false);
  });
});

describe('assetStateMachine — getValidTransitions', () => {
  test('disponible puede ir a asignado, en_mantencion y baja', () => {
    expect(getValidTransitions('disponible')).toEqual(['asignado', 'en_mantencion', 'baja']);
  });

  test('asignado puede ir a reutilizable, baja y en_mantencion', () => {
    expect(getValidTransitions('asignado')).toEqual(['reutilizable', 'baja', 'en_mantencion']);
  });

  test('en_mantencion puede ir a disponible, asignado y baja', () => {
    expect(getValidTransitions('en_mantencion')).toEqual(['disponible', 'asignado', 'baja']);
  });

  test('reutilizable puede ir a asignado, disponible y baja', () => {
    expect(getValidTransitions('reutilizable')).toEqual(['asignado', 'disponible', 'baja']);
  });

  test('baja solo puede ir a vendido', () => {
    expect(getValidTransitions('baja')).toEqual(['vendido']);
  });

  test('vendido no tiene transiciones (terminal)', () => {
    expect(getValidTransitions('vendido')).toEqual([]);
  });
});

describe('assetStateMachine — isTerminalState', () => {
  test('vendido es estado terminal', () => {
    expect(isTerminalState('vendido')).toBe(true);
  });

  test('baja NO es estado terminal (puede ir a vendido)', () => {
    expect(isTerminalState('baja')).toBe(false);
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
    expect(getTransitionDescription('vendido', 'disponible')).toBe('Transición no válida');
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
    const result = validateTransition('disponible', 'vendido', baseContext);
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

  // SPEC 2.7.7: asignado→reutilizable requiere devolución
  test('asignado→reutilizable sin devolución es inválida', () => {
    const result = validateTransition('asignado', 'reutilizable', {
      ...baseContext,
      hasActiveAssignment: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('devolución');
  });

  test('asignado→reutilizable con devolución danado es inválida (debe ir a baja)', () => {
    const result = validateTransition('asignado', 'reutilizable', {
      ...baseContext,
      hasActiveAssignment: true,
      estadoDevolucion: 'danado',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('baja');
  });

  test('asignado→reutilizable con devolución ok es válida', () => {
    const result = validateTransition('asignado', 'reutilizable', {
      ...baseContext,
      hasActiveAssignment: true,
      estadoDevolucion: 'ok',
    });
    expect(result.valid).toBe(true);
  });

  // SPEC 2.7.3: reutilizable→baja requiere motivo
  test('reutilizable→baja sin motivo es inválida', () => {
    const result = validateTransition('reutilizable', 'baja', baseContext);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('motivo');
  });

  test('reutilizable→baja con motivo es válida', () => {
    const result = validateTransition('reutilizable', 'baja', {
      ...baseContext,
      motivo: 'obsolescencia',
    });
    expect(result.valid).toBe(true);
  });

  // SPEC 2.7.5: en_mantencion→baja requiere motivo
  test('en_mantencion→baja sin motivo es inválida', () => {
    const result = validateTransition('en_mantencion', 'baja', baseContext);
    expect(result.valid).toBe(false);
  });

  test('en_mantencion→baja con motivo es válida', () => {
    const result = validateTransition('en_mantencion', 'baja', {
      ...baseContext,
      motivo: 'no_reparable',
    });
    expect(result.valid).toBe(true);
  });

  // SPEC 2.7.4: baja→vendido requiere datos de venta
  test('baja→vendido sin motivo (datos venta) es inválida', () => {
    const result = validateTransition('baja', 'vendido', baseContext);
    expect(result.valid).toBe(false);
  });

  test('baja→vendido con motivo (datos venta) es válida', () => {
    const result = validateTransition('baja', 'vendido', {
      ...baseContext,
      motivo: 'venta registrada',
    });
    expect(result.valid).toBe(true);
  });
});
