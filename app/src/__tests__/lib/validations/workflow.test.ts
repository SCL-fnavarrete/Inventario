import {
  createWorkflowRequestSchema,
  transitionSchema,
  workflowFiltersSchema,
  TipoSolicitudEnum,
  EstadoSolicitudEnum,
  PrioridadSolicitudEnum,
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

  test('prioridad por defecto es media', () => {
    const result = createWorkflowRequestSchema.safeParse(validOnboarding);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prioridad).toBe('media');
    }
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
      prioridad: 'alta',
      ubicacionDestino: 'Santiago',
      requiereNotebook: true,
      requiereCelular: false,
      requiereMonitor: true,
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

  test('acepta cambio_equipo con ticketFreshdesk opcional', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validCambio,
      ticketFreshdesk: 'INC-12345',
    });
    expect(result.success).toBe(true);
  });

  test('acepta cambio_equipo sin ticketFreshdesk', () => {
    const result = createWorkflowRequestSchema.safeParse(validCambio);
    expect(result.success).toBe(true);
  });
});

// ============================================================
// DEVOLUCION_TERMINO
// ============================================================
describe('createWorkflowRequestSchema — devolucion_termino', () => {
  const validDevolucion = {
    ...baseFields,
    tipo: 'devolucion_termino' as const,
    fechaDesvinculacion: '2026-03-31',
  };

  test('acepta datos mínimos válidos de devolucion_termino', () => {
    const result = createWorkflowRequestSchema.safeParse(validDevolucion);
    expect(result.success).toBe(true);
  });

  test('rechaza devolucion_termino sin fechaDesvinculacion', () => {
    const { fechaDesvinculacion, ...sin } = validDevolucion;
    const result = createWorkflowRequestSchema.safeParse(sin);
    expect(result.success).toBe(false);
  });

  test('rechaza devolucion_termino con fechaDesvinculacion vacía', () => {
    const result = createWorkflowRequestSchema.safeParse({
      ...validDevolucion,
      fechaDesvinculacion: '',
    });
    expect(result.success).toBe(false);
  });

  test('acepta devolucion_termino con campos opcionales de logística', () => {
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
    const result = transitionSchema.safeParse({
      nuevoEstado: 'cambio_ejecutado',
      datosAccion: {
        newAssetId: '550e8400-e29b-41d4-a716-446655440000',
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3pgAAAABJRU5ErkJggg==',
        aceptaPoliticaUso: true,
      },
    });
    expect(result.success).toBe(true);
  });

  test('acepta estado válido de devolucion_termino', () => {
    const result = transitionSchema.safeParse({
      nuevoEstado: 'consolidacion_cierre',
      datosAccion: {
        estadoNotebook: 'ok', estadoCelular: 'no_aplica', estadoMonitor: 'no_aplica', estadoKit: 'no_aplica',
        lugarDevolucion: 'Santiago',
        firmaEmpleadoDevolucion:
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3pgAAAABJRU5ErkJggg==',
        aceptaPoliticaUso: true,
      },
    });
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

  const firmaPng =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3pgAAAABJRU5ErkJggg==';

  test('requiere evidencia completa para la entrega oficial de onboarding', () => {
    const result = transitionSchema.safeParse({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: ['550e8400-e29b-41d4-a716-446655440000'],
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega: firmaPng,
        aceptaPoliticaUso: true,
      },
    });
    expect(result.success).toBe(true);
  });

  test('exige datos de coordinación y rechaza espacios en campos operativos', () => {
    expect(transitionSchema.safeParse({ nuevoEstado: 'equipo_recibido' }).success).toBe(false);
    expect(transitionSchema.safeParse({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: ['550e8400-e29b-41d4-a716-446655440000'],
        lugarEntrega: '   ', firmaEmpleadoEntrega: firmaPng, aceptaPoliticaUso: true,
      },
    }).success).toBe(false);
    expect(transitionSchema.safeParse({
      nuevoEstado: 'equipo_recibido', datosAccion: { medioDevolucion: '   ' },
    }).success).toBe(false);
  });

  test('rechaza la entrega oficial sin aceptación literal de política', () => {
    expect(
      transitionSchema.safeParse({
        nuevoEstado: 'equipos_entregados',
        datosAccion: {
          assetIds: ['550e8400-e29b-41d4-a716-446655440000'],
          lugarEntrega: 'Santiago',
          firmaEmpleadoEntrega: firmaPng,
          aceptaPoliticaUso: false,
        },
      }).success
    ).toBe(false);
  });

  test('rechaza timestamps de firma enviados por el cliente', () => {
    expect(
      transitionSchema.safeParse({
        nuevoEstado: 'equipos_entregados',
        datosAccion: {
          assetIds: ['550e8400-e29b-41d4-a716-446655440000'],
          lugarEntrega: 'Santiago',
          firmaEmpleadoEntrega: firmaPng,
          aceptaPoliticaUso: true,
          firmaEmpleadoEntregaEn: '2026-08-22T00:00:00.000Z',
        },
      }).success
    ).toBe(false);
  });

  test('exige la evidencia de devolución al cerrar un offboarding', () => {
    expect(
      transitionSchema.safeParse({
        nuevoEstado: 'consolidacion_cierre',
        datosAccion: {
          estadoNotebook: 'ok',
          estadoCelular: 'no_aplica',
          estadoMonitor: 'no_aplica',
          estadoKit: 'no_aplica',
          lugarDevolucion: 'Santiago',
          firmaEmpleadoDevolucion: firmaPng,
          aceptaPoliticaUso: true,
        },
      }).success
    ).toBe(true);
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
      estado: 'gestion_ti',
      prioridad: 'alta',
      page: 2,
      limit: 25,
      sortBy: 'prioridad',
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
    ['onboarding', 'cambio_equipo', 'devolucion_termino'].forEach((tipo) => {
      expect(TipoSolicitudEnum.safeParse(tipo).success).toBe(true);
    });
  });

  test('rechaza tipo inválido', () => {
    expect(TipoSolicitudEnum.safeParse('otro_tipo').success).toBe(false);
  });
});

describe('PrioridadSolicitudEnum', () => {
  test('acepta las 4 prioridades', () => {
    ['baja', 'media', 'alta', 'urgente'].forEach((p) => {
      expect(PrioridadSolicitudEnum.safeParse(p).success).toBe(true);
    });
  });
});

describe('EstadoSolicitudEnum', () => {
  test('acepta los 11 estados válidos', () => {
    const estados = [
      'solicitud_recibida', 'gestion_ti', 'equipos_entregados', 'registro_rrhh',
      'incidencia_detectada', 'cambio_ejecutado', 'confirmacion_rrhh',
      'solicitud_emitida', 'coordinacion_en_curso', 'equipo_recibido', 'consolidacion_cierre',
    ];
    estados.forEach((estado) => {
      expect(EstadoSolicitudEnum.safeParse(estado).success).toBe(true);
    });
  });

  test('rechaza estado inválido', () => {
    expect(EstadoSolicitudEnum.safeParse('estado_inexistente').success).toBe(false);
  });
});
