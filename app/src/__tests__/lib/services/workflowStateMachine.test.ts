import {
  getInitialState,
  isFinalState,
  getStatesForType,
  getNextStates,
  canTransition,
  isCancelled,
} from '@/lib/services/workflowStateMachine';

// SPEC: Sección 2.5.2 — Máquinas de estado por tipo de solicitud

describe('workflowStateMachine — getInitialState', () => {
  test('onboarding inicia en solicitud_recibida', () => {
    expect(getInitialState('onboarding')).toBe('solicitud_recibida');
  });

  test('cambio_equipo inicia en incidencia_detectada', () => {
    expect(getInitialState('cambio_equipo')).toBe('incidencia_detectada');
  });

  test('offboarding inicia en solicitud_emitida', () => {
    expect(getInitialState('offboarding')).toBe('solicitud_emitida');
  });
});

describe('workflowStateMachine — isFinalState', () => {
  test('registro_rrhh es estado final de onboarding', () => {
    expect(isFinalState('onboarding', 'registro_rrhh')).toBe(true);
  });

  test('equipos_entregados NO es estado final de onboarding', () => {
    expect(isFinalState('onboarding', 'equipos_entregados')).toBe(false);
  });

  test('confirmacion_rrhh es estado final de cambio_equipo', () => {
    expect(isFinalState('cambio_equipo', 'confirmacion_rrhh')).toBe(true);
  });

  test('cambio_ejecutado NO es estado final de cambio_equipo', () => {
    expect(isFinalState('cambio_equipo', 'cambio_ejecutado')).toBe(false);
  });

  test('consolidacion_cierre es estado final de offboarding', () => {
    expect(isFinalState('offboarding', 'consolidacion_cierre')).toBe(true);
  });

  test('equipo_recibido NO es estado final de offboarding', () => {
    expect(isFinalState('offboarding', 'equipo_recibido')).toBe(false);
  });
});

// 15-sep-2026 (SPEC 2.42): coordinando_entrega, coordinando_cambio y
// coordinacion_en_curso se eliminaron -- la coordinacion de fecha/medio/
// lugar se pide junto con la asignacion/ejecucion del equipo, en la misma
// transicion, no como etapa aparte.
describe('workflowStateMachine — getStatesForType', () => {
  test('onboarding tiene exactamente 4 estados en orden correcto', () => {
    expect(getStatesForType('onboarding')).toEqual([
      'solicitud_recibida',
      'gestion_ti',
      'equipos_entregados',
      'registro_rrhh',
    ]);
  });

  test('cambio_equipo tiene exactamente 3 estados', () => {
    expect(getStatesForType('cambio_equipo')).toEqual([
      'incidencia_detectada',
      'cambio_ejecutado',
      'confirmacion_rrhh',
    ]);
  });

  test('offboarding tiene exactamente 3 estados', () => {
    expect(getStatesForType('offboarding')).toEqual([
      'solicitud_emitida',
      'equipo_recibido',
      'consolidacion_cierre',
    ]);
  });
});

// SPEC Sección 2.5.3 Regla 1: solo tecnico/admin avanzan estados (los
// únicos dos roles que existen -- ver permissions.ts).
describe('workflowStateMachine — canTransition (transiciones permitidas)', () => {
  // Onboarding
  test('tecnico puede avanzar solicitud_recibida → gestion_ti (onboarding)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'tecnico')).toBe(true);
  });

  test('admin puede avanzar solicitud_recibida → gestion_ti (onboarding)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'admin')).toBe(true);
  });

  test('tecnico puede avanzar gestion_ti → equipos_entregados (onboarding, ya incluye coordinar entrega)', () => {
    expect(canTransition('onboarding', 'gestion_ti', 'equipos_entregados', 'tecnico')).toBe(true);
  });

  test('tecnico puede avanzar equipos_entregados → registro_rrhh (onboarding)', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'tecnico')).toBe(true);
  });

  test('admin puede avanzar equipos_entregados → registro_rrhh (onboarding)', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'admin')).toBe(true);
  });

  // Cambio equipo: incidencia_detectada -> cambio_ejecutado (ya incluye coordinar el cambio)
  test('tecnico puede avanzar incidencia_detectada → cambio_ejecutado', () => {
    expect(canTransition('cambio_equipo', 'incidencia_detectada', 'cambio_ejecutado', 'tecnico')).toBe(true);
  });

  test('tecnico puede avanzar cambio_ejecutado → confirmacion_rrhh', () => {
    expect(canTransition('cambio_equipo', 'cambio_ejecutado', 'confirmacion_rrhh', 'tecnico')).toBe(true);
  });

  // Offboarding: solicitud_emitida -> equipo_recibido (ya incluye coordinar la devolucion)
  test('tecnico puede avanzar solicitud_emitida → equipo_recibido', () => {
    expect(canTransition('offboarding', 'solicitud_emitida', 'equipo_recibido', 'tecnico')).toBe(true);
  });

  test('tecnico puede avanzar equipo_recibido → consolidacion_cierre', () => {
    expect(canTransition('offboarding', 'equipo_recibido', 'consolidacion_cierre', 'tecnico')).toBe(true);
  });
});

// Ya no hay un tercer rol para probar bloqueo: solo existen admin/tecnico,
// y ambos pueden ejecutar todas las transiciones (ver TRANSITIONS, todas
// con roles: ['tecnico', 'admin']). El caso "rol invalido no coincide con
// ningun `roles.includes()`" ya esta cubierto por los tests de entradas
// invalidas en permissions.test.ts.

describe('workflowStateMachine — canTransition (transiciones inválidas)', () => {
  test('NO se puede saltar gestion_ti: solicitud_recibida → equipos_entregados', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'equipos_entregados', 'admin')).toBe(false);
  });

  test('NO hay retroceso: registro_rrhh → gestion_ti', () => {
    expect(canTransition('onboarding', 'registro_rrhh', 'gestion_ti', 'admin')).toBe(false);
  });

  test('NO hay retroceso: equipos_entregados → solicitud_recibida', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'solicitud_recibida', 'admin')).toBe(false);
  });

  test('NO se puede usar estado de otro tipo en onboarding', () => {
    expect(canTransition('onboarding', 'incidencia_detectada', 'cambio_ejecutado', 'admin')).toBe(false);
  });

  test('NO hay transición al mismo estado', () => {
    expect(canTransition('onboarding', 'gestion_ti', 'gestion_ti', 'admin')).toBe(false);
  });
});

describe('workflowStateMachine — getNextStates', () => {
  test('tecnico en gestion_ti puede ir a equipos_entregados', () => {
    const next = getNextStates('onboarding', 'gestion_ti', 'tecnico');
    expect(next).toEqual(['equipos_entregados']);
  });

  test('tecnico en equipos_entregados puede ir a registro_rrhh', () => {
    const next = getNextStates('onboarding', 'equipos_entregados', 'tecnico');
    expect(next).toEqual(['registro_rrhh']);
  });

  test('admin en registro_rrhh (estado final) no tiene próximos estados', () => {
    const next = getNextStates('onboarding', 'registro_rrhh', 'admin');
    expect(next).toEqual([]);
  });

  test('tecnico en incidencia_detectada puede ir a cambio_ejecutado', () => {
    const next = getNextStates('cambio_equipo', 'incidencia_detectada', 'tecnico');
    expect(next).toEqual(['cambio_ejecutado']);
  });

  test('tecnico en equipo_recibido puede ir a consolidacion_cierre', () => {
    const next = getNextStates('offboarding', 'equipo_recibido', 'tecnico');
    expect(next).toEqual(['consolidacion_cierre']);
  });

  test('tecnico en solicitud_emitida puede ir a equipo_recibido', () => {
    const next = getNextStates('offboarding', 'solicitud_emitida', 'tecnico');
    expect(next).toEqual(['equipo_recibido']);
  });
});

// SPEC 2.5.2/2.5.3 Regla 7: cancelación es una acción aparte, no una
// transición del diagrama normal -- no pasa por TRANSITIONS/canTransition.
describe('workflowStateMachine — cancelación', () => {
  test('isCancelled reconoce el estado "cancelada"', () => {
    expect(isCancelled('cancelada')).toBe(true);
  });

  test('isCancelled es false para cualquier estado del flujo normal', () => {
    expect(isCancelled('solicitud_recibida')).toBe(false);
    expect(isCancelled('incidencia_detectada')).toBe(false);
    expect(isCancelled('registro_rrhh')).toBe(false);
    expect(isCancelled('confirmacion_rrhh')).toBe(false);
    expect(isCancelled('consolidacion_cierre')).toBe(false);
  });

  test('canTransition nunca permite llegar a "cancelada" (no está en TRANSITIONS)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'cancelada', 'admin')).toBe(false);
    expect(canTransition('cambio_equipo', 'incidencia_detectada', 'cancelada', 'admin')).toBe(false);
    expect(canTransition('offboarding', 'solicitud_emitida', 'cancelada', 'admin')).toBe(false);
  });

  test('getNextStates nunca devuelve "cancelada" como próximo estado', () => {
    expect(getNextStates('onboarding', 'solicitud_recibida', 'admin')).not.toContain('cancelada');
    expect(getNextStates('cambio_equipo', 'incidencia_detectada', 'admin')).not.toContain('cancelada');
    expect(getNextStates('offboarding', 'solicitud_emitida', 'admin')).not.toContain('cancelada');
  });
});
