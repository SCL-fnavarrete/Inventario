import {
  createWorkflowRequestSchema,
  transitionSchema,
  workflowFiltersSchema,
  cancelWorkflowRequestSchema,
  TipoSolicitudEnum,
  EstadoSolicitudEnum,
} from '@/lib/validations/workflow';

// Pruebas del sistema de solicitudes (workflow)

// Datos base reutilizables
const baseFields = {
  employeeId: '550e8400-e29b-41d4-a716-446655440000',
};

// ============================================================
// ONBOARDING
// ============================================================
describe('createWorkflowRequestSchema — onboarding', () => {
  const validOnboarding = {
    ...baseFields,
    tipo: 'onboarding' as const,
    fechaIngreso: '2026-04-07',
    cargoSolicitado: 'Analista TI',
  };

  test('acepta datos mínimos válidos de onboarding', () => {
    const result = createWorkflowRequestSchema.safeParse(validOnboarding);
    expect(result.success).toBe(true);
  });

  test('rechaza onboarding sin fechaIngreso', () => {
    const { fechaIngreso, ...sin } = validOnboarding;
    const result = createWorkflowRequestSchema.safeParse(sin);
    expect(result.success).toBe(false);
  });

  test('rechaza onboarding con fechaIngreso vacía', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validOnboarding,
      fechaIngreso: '',
    });
    expect(result.success).toBe(false);
  });

  test('rechaza onboarding sin cargoSolicitado', () => {
    const { cargoSolicitado, ...sin } = validOnboarding;
    const result = createWorkflowRequestSchema.safeParse(sin);
    expect(result.success).toBe(false);
  });

  test('acepta onboarding con campos opcionales', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validOnboarding,
      ubicacionDestino: 'Santiago',
      categoriasRequeridas: ['Notebook', 'Monitor'],
      observaciones: 'Nuevo ingreso área TI',
      pendientes: [
        { tipo: 'celular', descripcion: 'Pendiente de stock' },
        { tipo: 'mochila' },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rechaza employeeId con formato no UUID', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validOnboarding,
      employeeId: 'no-es-uuid',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// CAMBIO_EQUIPO
// ============================================================
describe('createWorkflowRequestSchema — cambio_equipo (SPEC 2.84)', () => {
  // Uno o varios equipos a cambiar, cada uno con su reemplazo y el estado en
  // que vuelve; se ejecutan al crear el ticket.
  const uuid = (n: number) => `550e8400-e29b-41d4-a716-44665544000${n}`;
  const cambio = (viejo: number, nuevo: number) => ({
    oldAssignmentId: uuid(viejo),
    newAssetId: uuid(nuevo),
    estadoDevolucion: 'ok' as const,
  });
  const validCambio = {
    ...baseFields,
    tipo: 'cambio_equipo' as const,
    motivoCambio: 'Pantalla rota, equipo inoperable',
    cambios: [cambio(1, 2)],
  };

  test('acepta un cambio de un equipo', () => {
    expect(createWorkflowRequestSchema.safeParse(validCambio).success).toBe(true);
  });

  test('acepta el cambio de varios equipos a la vez', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      cambios: [cambio(1, 2), cambio(3, 4), cambio(5, 6)],
    });
    expect(result.success).toBe(true);
  });

  test('acepta observaciones, "no_devuelto" y datos del cargador', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      cambios: [
        {
          ...cambio(1, 2),
          estadoDevolucion: 'no_devuelto' as const,
          observacionesDevolucion: 'No lo entregó',
          condicionCargadorAnterior: 'con_danos',
          condicionCargadorNuevo: 'operativo',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  test('rechaza sin equipos a cambiar (falta la lista o viene vacía)', () => {
    const { cambios, ...sinCambios } = validCambio;
    void cambios;
    expect(createWorkflowRequestSchema.safeParse(sinCambios).success).toBe(false);
    expect(createWorkflowRequestSchema.safeParse({ ...validCambio, cambios: [] }).success).toBe(false);
  });

  test('rechaza un cambio sin reemplazo o sin estado de devolución', () => {
    const { newAssetId, ...sinReemplazo } = cambio(1, 2);
    void newAssetId;
    const { estadoDevolucion, ...sinEstado } = cambio(1, 2);
    void estadoDevolucion;
    expect(
      createWorkflowRequestSchema.safeParse({ ...validCambio, cambios: [sinReemplazo] }).success
    ).toBe(false);
    expect(
      createWorkflowRequestSchema.safeParse({ ...validCambio, cambios: [sinEstado] }).success
    ).toBe(false);
  });

  test('rechaza el mismo equipo dos veces', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      cambios: [cambio(1, 2), cambio(1, 3)],
    });
    expect(result.success).toBe(false);
  });

  test('rechaza el mismo reemplazo para dos equipos', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      cambios: [cambio(1, 2), cambio(3, 2)],
    });
    expect(result.success).toBe(false);
  });

  test('rechaza cambio_equipo sin motivoCambio o con motivo vacío', () => {
    const { motivoCambio, ...sin } = validCambio;
    void motivoCambio;
    expect(createWorkflowRequestSchema.safeParse(sin).success).toBe(false);
    expect(createWorkflowRequestSchema.safeParse({ ...validCambio, motivoCambio: '' }).success).toBe(
      false
    );
  });
});

// ============================================================
// ONBOARDING — reincorporación (empleado existente + tipoContrato)
// ============================================================
describe('createWorkflowRequestSchema — onboarding con reincorporación', () => {
  const validReincorporacion = {
    employeeId: '550e8400-e29b-41d4-a716-446655440000',
    tipo: 'onboarding' as const,
    fechaIngreso: '2026-04-07',
    cargoSolicitado: 'Analista TI',
  };

  test('acepta onboarding sobre empleado existente sin tipoContrato (no cambia)', () => {
    const result = createWorkflowRequestSchema.safeParse(validReincorporacion);
    expect(result.success).toBe(true);
  });

  test('acepta onboarding sobre empleado existente actualizando tipoContrato a "contrato"', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validReincorporacion,
      tipoContrato: 'contrato',
    });
    expect(result.success).toBe(true);
  });

  test('acepta onboarding sobre empleado existente actualizando tipoContrato a "boleta"', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validReincorporacion,
      tipoContrato: 'boleta',
    });
    expect(result.success).toBe(true);
  });

  test('rechaza tipoContrato con valor no reconocido', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validReincorporacion,
      tipoContrato: 'honorarios',
    });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// CANCELACIÓN
// ============================================================
describe('cancelWorkflowRequestSchema', () => {
  test('acepta un motivo válido', () => {
    const result = cancelWorkflowRequestSchema.safeParse({
      motivo: 'Ticket creado por error, no corresponde',
    });
    expect(result.success).toBe(true);
  });

  test('rechaza sin motivo', () => {
    const result = cancelWorkflowRequestSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('rechaza motivo vacío', () => {
    const result = cancelWorkflowRequestSchema.safeParse({ motivo: '' });
    expect(result.success).toBe(false);
  });

  test('rechaza motivo mayor a 1000 caracteres', () => {
    const result = cancelWorkflowRequestSchema.safeParse({ motivo: 'a'.repeat(1001) });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// DEVOLUCION_TERMINO
// ============================================================
describe('createWorkflowRequestSchema — offboarding', () => {
  const validDevolucion = {
    ...baseFields,
    tipo: 'offboarding' as const,
    fechaDesvinculacion: '2026-03-31',
  };

  test('acepta datos mínimos válidos de offboarding', () => {
    const result = createWorkflowRequestSchema.safeParse(validDevolucion);
    expect(result.success).toBe(true);
  });

  // SPEC 2.87: la exige el servidor, salvo en la recuperacion de equipos
  // de alguien ya desvinculado (usa la de la desvinculacion original).
  test('acepta offboarding sin fechaDesvinculacion', () => {
    const { fechaDesvinculacion: _omitida, ...sin } = validDevolucion;
    const result = createWorkflowRequestSchema.safeParse(sin);
    expect(result.success).toBe(true);
  });

  test('rechaza offboarding con fechaDesvinculacion vacía', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validDevolucion,
      fechaDesvinculacion: '',
    });
    expect(result.success).toBe(false);
  });

  test('acepta offboarding con campos opcionales de logística', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validDevolucion,
      medioDevolucion: 'Chilexpress',
      otChilexpress: 'CH-2026-001234',
      ciudadDevolucion: 'Concepción',
    });
    expect(result.success).toBe(true);
  });

  test('todos los campos de logística son opcionales', () => {
    const result = createWorkflowRequestSchema.safeParse(validDevolucion);
    expect(result.success).toBe(true);
  });
});

// ============================================================
// TRANSITION SCHEMA
// ============================================================
describe('transitionSchema', () => {
  test('acepta estado válido de onboarding', () => {
    const result = transitionSchema.safeParse({ nuevoEstado: 'gestion_ti' });
    expect(result.success).toBe(true);
  });

  test('acepta estado válido de cambio_equipo', () => {
    const result = transitionSchema.safeParse({ nuevoEstado: 'cambio_ejecutado' });
    expect(result.success).toBe(true);
  });

  test('acepta estado válido de offboarding', () => {
    const result = transitionSchema.safeParse({ nuevoEstado: 'consolidacion_cierre' });
    expect(result.success).toBe(true);
  });

  test('rechaza estado no reconocido', () => {
    const result = transitionSchema.safeParse({ nuevoEstado: 'estado_inventado' });
    expect(result.success).toBe(false);
  });

  test('rechaza sin nuevoEstado', () => {
    const result = transitionSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  test('acepta comentario opcional', () => {
    const result = transitionSchema.safeParse({
      nuevoEstado: 'gestion_ti',
      comentario: 'Revisando disponibilidad de equipos',
    });
    expect(result.success).toBe(true);
  });

  test('acepta datosAccion como objeto libre', () => {
    const result = transitionSchema.safeParse({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: ['uuid-1', 'uuid-2'],
        lugarEntrega: 'Santiago',
      },
    });
    expect(result.success).toBe(true);
  });
});

// ============================================================
// WORKFLOW FILTERS SCHEMA
// ============================================================
describe('workflowFiltersSchema', () => {
  test('valores por defecto: page=1, limit=10, sortBy=createdAt', () => {
    const result = workflowFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
      expect(result.data.sortBy).toBe('createdAt');
      expect(result.data.sortOrder).toBe('desc');
    }
  });

  test('rechaza limit mayor a 100', () => {
    const result = workflowFiltersSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  test('rechaza page menor a 1', () => {
    const result = workflowFiltersSchema.safeParse({ page: 0 });
    expect(result.success).toBe(false);
  });

  test('acepta filtros válidos', () => {
    const result = workflowFiltersSchema.safeParse({
      tipo: 'onboarding',
      estado: 'abierto',
      page: 2,
      limit: 25,
      sortBy: 'updatedAt',
      sortOrder: 'asc',
    });
    expect(result.success).toBe(true);
  });

  test('rechaza tipo no válido', () => {
    const result = workflowFiltersSchema.safeParse({ tipo: 'tipo_inventado' });
    expect(result.success).toBe(false);
  });

  test('rechaza sortBy no válido', () => {
    const result = workflowFiltersSchema.safeParse({ sortBy: 'campo_inventado' });
    expect(result.success).toBe(false);
  });
});

// ============================================================
// ENUMS
// ============================================================
describe('TipoSolicitudEnum', () => {
  test('acepta los 3 tipos válidos', () => {
    ['onboarding', 'cambio_equipo', 'offboarding'].forEach((tipo) => {
      expect(TipoSolicitudEnum.safeParse(tipo).success).toBe(true);
    });
  });

  test('rechaza tipo inválido', () => {
    expect(TipoSolicitudEnum.safeParse('otro_tipo').success).toBe(false);
  });
});

// La coordinacion de fecha/medio/lugar se pide junto con la
// asignacion/ejecucion del equipo, no como estado aparte.
describe('EstadoSolicitudEnum', () => {
  test('acepta los 10 estados válidos del flujo normal', () => {
    const estados = [
      'solicitud_recibida', 'gestion_ti', 'equipos_entregados', 'registro_rrhh',
      'incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh',
      'solicitud_emitida', 'equipo_recibido', 'consolidacion_cierre',
    ];
    estados.forEach((estado) => {
      expect(EstadoSolicitudEnum.safeParse(estado).success).toBe(true);
    });
  });

  test('acepta "cancelada" (estado de cancelación, fuera del flujo normal)', () => {
    expect(EstadoSolicitudEnum.safeParse('cancelada').success).toBe(true);
  });

  test('rechaza estado inválido', () => {
    expect(EstadoSolicitudEnum.safeParse('estado_inexistente').success).toBe(false);
  });
});
