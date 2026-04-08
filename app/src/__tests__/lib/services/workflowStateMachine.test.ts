import {
  getInitialState,
  isFinalState,
  getStatesForType,
  getNextStates,
  canTransition,
} from '@/lib/services/workflowStateMachine';

// SPEC: Sección 2.5.2 — Máquinas de estado por tipo de solicitud

describe('workflowStateMachine — getInitialState', () => {
  test('onboarding inicia en solicitud_recibida', () => {
    expect(getInitialState('onboarding')).toBe('solicitud_recibida');
  });

  test('cambio_equipo inicia en incidencia_detectada', () => {
    expect(getInitialState('cambio_equipo')).toBe('incidencia_detectada');
  });

  test('devolucion_termino inicia en solicitud_emitida', () => {
    expect(getInitialState('devolucion_termino')).toBe('solicitud_emitida');
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

  test('consolidacion_cierre es estado final de devolucion_termino', () => {
    expect(isFinalState('devolucion_termino', 'consolidacion_cierre')).toBe(true);
  });

  test('equipo_recibido NO es estado final de devolucion_termino', () => {
    expect(isFinalState('devolucion_termino', 'equipo_recibido')).toBe(false);
  });
});

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

  test('devolucion_termino tiene exactamente 4 estados', () => {
    expect(getStatesForType('devolucion_termino')).toEqual([
      'solicitud_emitida',
      'coordinacion_en_curso',
      'equipo_recibido',
      'consolidacion_cierre',
    ]);
  });
});

// SPEC Sección 2.5.3 Regla 1: Solo tecnico/admin avanzan estados TI; solo rrhh/admin confirman RRHH
describe('workflowStateMachine — canTransition (transiciones permitidas)', () => {
  // Onboarding
  test('tecnico puede avanzar solicitud_recibida → gestion_ti (onboarding)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'tecnico')).toBe(true);
  });

  test('admin puede avanzar solicitud_recibida → gestion_ti (onboarding)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'admin')).toBe(true);
  });

  test('tecnico puede avanzar gestion_ti → equipos_entregados (onboarding)', () => {
    expect(canTransition('onboarding', 'gestion_ti', 'equipos_entregados', 'tecnico')).toBe(true);
  });

  test('rrhh puede avanzar equipos_entregados → registro_rrhh (onboarding)', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'rrhh')).toBe(true);
  });

  test('admin puede avanzar equipos_entregados → registro_rrhh (onboarding)', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'admin')).toBe(true);
  });

  // Cambio equipo
  test('tecnico puede avanzar incidencia_detectada → cambio_ejecutado', () => {
    expect(canTransition('cambio_equipo', 'incidencia_detectada', 'cambio_ejecutado', 'tecnico')).toBe(true);
  });

  test('rrhh puede avanzar cambio_ejecutado → confirmacion_rrhh', () => {
    expect(canTransition('cambio_equipo', 'cambio_ejecutado', 'confirmacion_rrhh', 'rrhh')).toBe(true);
  });

  // Devolucion termino
  test('tecnico puede avanzar solicitud_emitida → coordinacion_en_curso', () => {
    expect(canTransition('devolucion_termino', 'solicitud_emitida', 'coordinacion_en_curso', 'tecnico')).toBe(true);
  });

  test('tecnico puede avanzar coordinacion_en_curso → equipo_recibido', () => {
    expect(canTransition('devolucion_termino', 'coordinacion_en_curso', 'equipo_recibido', 'tecnico')).toBe(true);
  });

  test('rrhh puede avanzar equipo_recibido → consolidacion_cierre', () => {
    expect(canTransition('devolucion_termino', 'equipo_recibido', 'consolidacion_cierre', 'rrhh')).toBe(true);
  });
});

describe('workflowStateMachine — canTransition (transiciones bloqueadas por rol)', () => {
  test('rrhh NO puede avanzar solicitud_recibida → gestion_ti (onboarding)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'rrhh')).toBe(false);
  });

  test('supervisor NO puede avanzar solicitud_recibida → gestion_ti (onboarding)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'supervisor')).toBe(false);
  });

  test('auditor NO puede avanzar ningún estado (onboarding)', () => {
    expect(canTransition('onboarding', 'solicitud_recibida', 'gestion_ti', 'auditor')).toBe(false);
  });

  test('tecnico NO puede confirmar equipos_entregados → registro_rrhh (solo rrhh/admin)', () => {
    expect(canTransition('onboarding', 'equipos_entregados', 'registro_rrhh', 'tecnico')).toBe(false);
  });

  test('tecnico NO puede confirmar cambio_ejecutado → confirmacion_rrhh (solo rrhh/admin)', () => {
    expect(canTransition('cambio_equipo', 'cambio_ejecutado', 'confirmacion_rrhh', 'tecnico')).toBe(false);
  });

  test('tecnico NO puede cerrar equipo_recibido → consolidacion_cierre (solo rrhh/admin)', () => {
    expect(canTransition('devolucion_termino', 'equipo_recibido', 'consolidacion_cierre', 'tecnico')).toBe(false);
  });

  test('auditor NO puede cerrar equipo_recibido → consolidacion_cierre', () => {
    expect(canTransition('devolucion_termino', 'equipo_recibido', 'consolidacion_cierre', 'auditor')).toBe(false);
  });
});

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

  test('rrhh en equipos_entregados puede ir a registro_rrhh', () => {
    const next = getNextStates('onboarding', 'equipos_entregados', 'rrhh');
    expect(next).toEqual(['registro_rrhh']);
  });

  test('tecnico en equipos_entregados no tiene próximos estados', () => {
    const next = getNextStates('onboarding', 'equipos_entregados', 'tecnico');
    expect(next).toEqual([]);
  });

  test('admin en registro_rrhh (estado final) no tiene próximos estados', () => {
    const next = getNextStates('onboarding', 'registro_rrhh', 'admin');
    expect(next).toEqual([]);
  });

  test('tecnico en incidencia_detectada puede ir a cambio_ejecutado', () => {
    const next = getNextStates('cambio_equipo', 'incidencia_detectada', 'tecnico');
    expect(next).toEqual(['cambio_ejecutado']);
  });

  test('rrhh en equipo_recibido puede ir a consolidacion_cierre', () => {
    const next = getNextStates('devolucion_termino', 'equipo_recibido', 'rrhh');
    expect(next).toEqual(['consolidacion_cierre']);
  });
});
