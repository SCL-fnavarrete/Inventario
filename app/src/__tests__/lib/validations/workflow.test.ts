import {
  createWorkflowRequestSchema,
  transitionSchema,
  workflowFiltersSchema,
  cancelWorkflowRequestSchema,
  TipoSolicitudEnum,
  EstadoSolicitudEnum,
} from '@/lib/validations/workflow';

// SPEC: Sección 2.5 — Sistema de Solicitudes (Workflow)

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
describe('createWorkflowRequestSchema — cambio_equipo', () => {
  const validCambio = {
    ...baseFields,
    tipo: 'cambio_equipo' as const,
    motivoCambio: 'Pantalla rota, equipo inoperable',
  };

  test('acepta datos mínimos válidos de cambio_equipo', () => {
    const result = createWorkflowRequestSchema.safeParse(validCambio);
    expect(result.success).toBe(true);
  });

  test('rechaza cambio_equipo sin motivoCambio', () => {
    const { motivoCambio, ...sin } = validCambio;
    const result = createWorkflowRequestSchema.safeParse(sin);
    expect(result.success).toBe(false);
  });

  test('rechaza cambio_equipo con motivoCambio vacío', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      motivoCambio: '',
    });
    expect(result.success).toBe(false);
  });

});

// ============================================================
// CAMBIO_EQUIPO — ejecución inmediata al crear el ticket
// ============================================================
describe('createWorkflowRequestSchema — cambio_equipo con ejecución inmediata', () => {
  const validCambio = {
    ...baseFields,
    tipo: 'cambio_equipo' as const,
    motivoCambio: 'Pantalla rota, equipo inoperable',
  };
  const datosEjecucion = {
    oldAssignmentId: '550e8400-e29b-41d4-a716-446655440001',
    newAssetId: '550e8400-e29b-41d4-a716-446655440002',
    estadoDevolucionAnterior: 'ok' as const,
  };

  test('acepta cambio_equipo sin datos de ejecución (solo incidencia)', () => {
    const result = createWorkflowRequestSchema.safeParse(validCambio);
    expect(result.success).toBe(true);
  });

  test('acepta cambio_equipo con los 3 datos de ejecución completos', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      ...datosEjecucion,
    });
    expect(result.success).toBe(true);
  });

  test('acepta observacionesDevolucionAnterior opcional junto a los 3 obligatorios', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      ...datosEjecucion,
      observacionesDevolucionAnterior: 'Equipo con rayones menores',
    });
    expect(result.success).toBe(true);
  });

  test('rechaza cambio_equipo con solo oldAssignmentId (falta newAssetId y estado)', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      oldAssignmentId: datosEjecucion.oldAssignmentId,
    });
    expect(result.success).toBe(false);
  });

  test('rechaza cambio_equipo con oldAssignmentId + newAssetId pero sin estadoDevolucionAnterior', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      oldAssignmentId: datosEjecucion.oldAssignmentId,
      newAssetId: datosEjecucion.newAssetId,
    });
    expect(result.success).toBe(false);
  });

  test('rechaza cambio_equipo con solo estadoDevolucionAnterior', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      estadoDevolucionAnterior: 'danado' as const,
    });
    expect(result.success).toBe(false);
  });

  test('acepta estadoDevolucionAnterior "no_devuelto" dentro del set completo', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      ...datosEjecucion,
      estadoDevolucionAnterior: 'no_devuelto' as const,
    });
    expect(result.success).toBe(true);
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

  test('rechaza offboarding sin fechaDesvinculacion', () => {
    const { fechaDesvinculacion, ...sin } = validDevolucion;
    const result = createWorkflowRequestSchema.safeParse(sin);
    expect(result.success).toBe(false);
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

describe('EstadoSolicitudEnum', () => {
  test('acepta los 13 estados válidos del flujo normal', () => {
    const estados = [
      'solicitud_recibida', 'gestion_ti', 'coordinando_entrega', 'equipos_entregados', 'registro_rrhh',
      'incidencia_detectada', 'coordinando_cambio', 'cambio_ejecutado', 'confirmacion_rrhh',
      'solicitud_emitida', 'coordinacion_en_curso', 'equipo_recibido', 'consolidacion_cierre',
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
