import {
  createAssignmentSchema,
  createMultipleAssignmentsSchema,
  returnAssignmentSchema,
  assignmentFiltersSchema,
  TipoMovimientoEnum,
  EstadoDevolucionEnum,
} from '@/lib/validations/assignment'

describe('Assignment Validation - TipoMovimientoEnum', () => {
  test('should accept valid tipos de movimiento', () => {
    const validTipos = ['ingreso', 'cambio', 'reemplazo', 'temporal']

    validTipos.forEach((tipo) => {
      const result = TipoMovimientoEnum.safeParse(tipo)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid tipo', () => {
    const result = TipoMovimientoEnum.safeParse('prestamo')
    expect(result.success).toBe(false)
  })
})

describe('Assignment Validation - EstadoDevolucionEnum', () => {
  test('should accept valid estados de devolucion', () => {
    const validEstados = ['ok', 'danado', 'incompleto']

    validEstados.forEach((estado) => {
      const result = EstadoDevolucionEnum.safeParse(estado)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid estado', () => {
    const result = EstadoDevolucionEnum.safeParse('perdido')
    expect(result.success).toBe(false)
  })
})

describe('Assignment Validation - createAssignmentSchema', () => {
  const validAssignment = {
    assetId: '550e8400-e29b-41d4-a716-446655440000',
    employeeId: '550e8400-e29b-41d4-a716-446655440001',
    fechaEntrega: '2024-01-15',
    tipoMovimiento: 'ingreso' as const,
  }

  test('should accept valid minimum assignment data', () => {
    const result = createAssignmentSchema.safeParse(validAssignment)
    expect(result.success).toBe(true)
  })

  test('should accept full assignment data', () => {
    const fullAssignment = {
      ...validAssignment,
      lugarEntrega: 'Santiago',
      entregadoPor: 'Juan Perez',
      motivo: 'Nuevo ingreso',
    }

    const result = createAssignmentSchema.safeParse(fullAssignment)
    expect(result.success).toBe(true)
  })

  test('should transform fechaEntrega to Date', () => {
    const result = createAssignmentSchema.safeParse(validAssignment)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaEntrega).toBeInstanceOf(Date)
    }
  })

  test('should reject missing assetId', () => {
    const { assetId, ...assignmentWithoutAsset } = validAssignment
    const result = createAssignmentSchema.safeParse(assignmentWithoutAsset)
    expect(result.success).toBe(false)
  })

  test('should reject invalid assetId format', () => {
    const result = createAssignmentSchema.safeParse({
      ...validAssignment,
      assetId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing employeeId', () => {
    const { employeeId, ...assignmentWithoutEmployee } = validAssignment
    const result = createAssignmentSchema.safeParse(assignmentWithoutEmployee)
    expect(result.success).toBe(false)
  })

  test('should reject invalid employeeId format', () => {
    const result = createAssignmentSchema.safeParse({
      ...validAssignment,
      employeeId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing fechaEntrega', () => {
    const { fechaEntrega, ...assignmentWithoutFecha } = validAssignment
    const result = createAssignmentSchema.safeParse(assignmentWithoutFecha)
    expect(result.success).toBe(false)
  })

  test('should reject missing tipoMovimiento', () => {
    const { tipoMovimiento, ...assignmentWithoutTipo } = validAssignment
    const result = createAssignmentSchema.safeParse(assignmentWithoutTipo)
    expect(result.success).toBe(false)
  })

  test('should reject lugarEntrega exceeding 100 characters', () => {
    const result = createAssignmentSchema.safeParse({
      ...validAssignment,
      lugarEntrega: 'A'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  test('should accept null for optional fields', () => {
    const result = createAssignmentSchema.safeParse({
      ...validAssignment,
      lugarEntrega: null,
      entregadoPor: null,
      motivo: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('Assignment Validation - createMultipleAssignmentsSchema', () => {
  const validMultipleAssignment = {
    employeeId: '550e8400-e29b-41d4-a716-446655440001',
    assetIds: [
      '550e8400-e29b-41d4-a716-446655440000',
      '550e8400-e29b-41d4-a716-446655440002',
    ],
    fechaEntrega: '2024-01-15',
    tipoMovimiento: 'ingreso' as const,
  }

  test('should accept valid multiple assignment data', () => {
    const result = createMultipleAssignmentsSchema.safeParse(validMultipleAssignment)
    expect(result.success).toBe(true)
  })

  test('should reject empty assetIds array', () => {
    const result = createMultipleAssignmentsSchema.safeParse({
      ...validMultipleAssignment,
      assetIds: [],
    })
    expect(result.success).toBe(false)
  })

  test('should reject invalid UUID in assetIds', () => {
    const result = createMultipleAssignmentsSchema.safeParse({
      ...validMultipleAssignment,
      assetIds: ['valid-uuid', 'not-a-uuid'],
    })
    expect(result.success).toBe(false)
  })
})

describe('Assignment Validation - returnAssignmentSchema', () => {
  const validReturn = {
    fechaDevolucion: '2024-06-15',
    estadoDevolucion: 'ok' as const,
  }

  test('should accept valid minimum return data', () => {
    const result = returnAssignmentSchema.safeParse(validReturn)
    expect(result.success).toBe(true)
  })

  test('should accept full return data', () => {
    const fullReturn = {
      ...validReturn,
      recibidoPor: 'Maria Rodriguez',
      observacionesDevolucion: 'Equipo en buen estado',
    }

    const result = returnAssignmentSchema.safeParse(fullReturn)
    expect(result.success).toBe(true)
  })

  test('should transform fechaDevolucion to Date', () => {
    const result = returnAssignmentSchema.safeParse(validReturn)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaDevolucion).toBeInstanceOf(Date)
    }
  })

  test('should reject missing fechaDevolucion', () => {
    const { fechaDevolucion, ...returnWithoutFecha } = validReturn
    const result = returnAssignmentSchema.safeParse(returnWithoutFecha)
    expect(result.success).toBe(false)
  })

  test('should reject missing estadoDevolucion', () => {
    const { estadoDevolucion, ...returnWithoutEstado } = validReturn
    const result = returnAssignmentSchema.safeParse(returnWithoutEstado)
    expect(result.success).toBe(false)
  })

  test('should reject invalid estadoDevolucion', () => {
    const result = returnAssignmentSchema.safeParse({
      ...validReturn,
      estadoDevolucion: 'perdido',
    })
    expect(result.success).toBe(false)
  })
})

describe('Assignment Validation - assignmentFiltersSchema', () => {
  test('should accept empty filters with defaults', () => {
    const result = assignmentFiltersSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(10)
      expect(result.data.sortBy).toBe('fechaEntrega')
      expect(result.data.sortOrder).toBe('desc')
    }
  })

  test('should accept valid filters', () => {
    const result = assignmentFiltersSchema.safeParse({
      search: 'notebook',
      employeeId: '550e8400-e29b-41d4-a716-446655440001',
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      activo: 'true',
      tipoMovimiento: 'ingreso',
      fechaDesde: '2024-01-01',
      fechaHasta: '2024-12-31',
      page: 2,
      limit: 25,
      sortBy: 'createdAt',
      sortOrder: 'asc',
    })
    expect(result.success).toBe(true)
  })

  test('should transform activo string to boolean', () => {
    const result = assignmentFiltersSchema.safeParse({
      activo: 'true',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.activo).toBe(true)
    }
  })

  test('should transform activo false string to boolean', () => {
    const result = assignmentFiltersSchema.safeParse({
      activo: 'false',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.activo).toBe(false)
    }
  })

  test('should reject invalid sortBy field', () => {
    const result = assignmentFiltersSchema.safeParse({
      sortBy: 'invalidField',
    })
    expect(result.success).toBe(false)
  })
})
