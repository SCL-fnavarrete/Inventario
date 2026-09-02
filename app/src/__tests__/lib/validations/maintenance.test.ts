import {
  createMaintenanceSchema,
  updateMaintenanceSchema,
  completeMaintenanceSchema,
  maintenanceFiltersSchema,
  TipoMantencionEnum,
  EstadoMantencionEnum,
} from '@/lib/validations/maintenance'

describe('Maintenance Validation - TipoMantencionEnum', () => {
  test('should accept valid tipos de mantencion', () => {
    const validTipos = [
      'preventiva',
      'correctiva',
      'actualizacion_so',
      'limpieza',
      'reparacion',
    ]

    validTipos.forEach((tipo) => {
      const result = TipoMantencionEnum.safeParse(tipo)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid tipo', () => {
    const result = TipoMantencionEnum.safeParse('revision')
    expect(result.success).toBe(false)
  })
})

describe('Maintenance Validation - EstadoMantencionEnum', () => {
  test('should accept valid estados', () => {
    const validEstados = ['pendiente', 'en_proceso', 'completada', 'cancelada']

    validEstados.forEach((estado) => {
      const result = EstadoMantencionEnum.safeParse(estado)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid estado', () => {
    const result = EstadoMantencionEnum.safeParse('finalizada')
    expect(result.success).toBe(false)
  })
})

describe('Maintenance Validation - createMaintenanceSchema', () => {
  const validMaintenance = {
    assetId: '550e8400-e29b-41d4-a716-446655440000',
    tipo: 'preventiva' as const,
    descripcion: 'Mantencion preventiva trimestral',
  }

  test('should accept valid minimum maintenance data', () => {
    const result = createMaintenanceSchema.safeParse(validMaintenance)
    expect(result.success).toBe(true)
  })

  test('should accept full maintenance data', () => {
    const fullMaintenance = {
      ...validMaintenance,
      fechaProgramada: '2024-03-15',
      proximaMantencion: '2024-06-15',
      realizadoPor: 'Juan Tecnico',
      costo: 50000,
      proveedorExterno: 'TecnoService Ltda.',
    }

    const result = createMaintenanceSchema.safeParse(fullMaintenance)
    expect(result.success).toBe(true)
  })

  test('should transform fechaProgramada to Date', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      fechaProgramada: '2024-03-15',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaProgramada).toBeInstanceOf(Date)
    }
  })

  test('should handle invalid date strings gracefully', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      fechaProgramada: 'not-a-date',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaProgramada).toBeNull()
    }
  })

  test('should reject missing assetId', () => {
    const { assetId, ...maintenanceWithoutAsset } = validMaintenance
    const result = createMaintenanceSchema.safeParse(maintenanceWithoutAsset)
    expect(result.success).toBe(false)
  })

  test('should reject invalid assetId format', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      assetId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing tipo', () => {
    const { tipo, ...maintenanceWithoutTipo } = validMaintenance
    const result = createMaintenanceSchema.safeParse(maintenanceWithoutTipo)
    expect(result.success).toBe(false)
  })

  test('should reject invalid tipo', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      tipo: 'revision',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing descripcion', () => {
    const { descripcion, ...maintenanceWithoutDescripcion } = validMaintenance
    const result = createMaintenanceSchema.safeParse(maintenanceWithoutDescripcion)
    expect(result.success).toBe(false)
  })

  test('should reject empty descripcion', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      descripcion: '',
    })
    expect(result.success).toBe(false)
  })

  test('should reject descripcion exceeding 1000 characters', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      descripcion: 'A'.repeat(1001),
    })
    expect(result.success).toBe(false)
  })

  test('should reject negative costo', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      costo: -1000,
    })
    expect(result.success).toBe(false)
  })

  // Una mantencion en garantia o hecha por el proveedor cuesta 0: es un dato
  // valido, no una ausencia de dato (que se expresa con null).
  test('should accept zero costo', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      costo: 0,
    })
    expect(result.success).toBe(true)
  })

  test('should accept null costo', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      costo: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('Maintenance Validation - updateMaintenanceSchema', () => {
  test('should accept partial data', () => {
    const result = updateMaintenanceSchema.safeParse({
      descripcion: 'Descripcion actualizada',
    })
    expect(result.success).toBe(true)
  })

  test('should accept empty object', () => {
    const result = updateMaintenanceSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('should validate tipo if provided', () => {
    const result = updateMaintenanceSchema.safeParse({
      tipo: 'invalid-tipo',
    })
    expect(result.success).toBe(false)
  })

  test('should accept estado change', () => {
    const result = updateMaintenanceSchema.safeParse({
      estado: 'completada',
    })
    expect(result.success).toBe(true)
  })

  test('should accept fechaRealizada', () => {
    const result = updateMaintenanceSchema.safeParse({
      fechaRealizada: '2024-03-20',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaRealizada).toBeInstanceOf(Date)
    }
  })

  test('should still validate descripcion constraints', () => {
    const result = updateMaintenanceSchema.safeParse({
      descripcion: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('Maintenance Validation - completeMaintenanceSchema', () => {
  const validCompletion = {
    fechaRealizada: '2024-03-20',
    realizadoPor: 'Juan Tecnico',
    resultado: 'Mantencion completada exitosamente',
  }

  test('should accept valid completion data', () => {
    const result = completeMaintenanceSchema.safeParse(validCompletion)
    expect(result.success).toBe(true)
  })

  test('should accept completion with optional fields', () => {
    const fullCompletion = {
      ...validCompletion,
      costo: 75000,
      proximaMantencion: '2024-06-20',
    }

    const result = completeMaintenanceSchema.safeParse(fullCompletion)
    expect(result.success).toBe(true)
  })

  test('should transform fechaRealizada to Date', () => {
    const result = completeMaintenanceSchema.safeParse(validCompletion)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaRealizada).toBeInstanceOf(Date)
    }
  })

  test('should reject missing fechaRealizada', () => {
    const { fechaRealizada, ...completionWithoutFecha } = validCompletion
    const result = completeMaintenanceSchema.safeParse(completionWithoutFecha)
    expect(result.success).toBe(false)
  })

  test('should reject missing realizadoPor', () => {
    const { realizadoPor, ...completionWithoutRealizado } = validCompletion
    const result = completeMaintenanceSchema.safeParse(completionWithoutRealizado)
    expect(result.success).toBe(false)
  })

  test('should reject empty realizadoPor', () => {
    const result = completeMaintenanceSchema.safeParse({
      ...validCompletion,
      realizadoPor: '',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing resultado', () => {
    const { resultado, ...completionWithoutResultado } = validCompletion
    const result = completeMaintenanceSchema.safeParse(completionWithoutResultado)
    expect(result.success).toBe(false)
  })

  test('should reject empty resultado', () => {
    const result = completeMaintenanceSchema.safeParse({
      ...validCompletion,
      resultado: '',
    })
    expect(result.success).toBe(false)
  })

  test('should reject resultado exceeding 1000 characters', () => {
    const result = completeMaintenanceSchema.safeParse({
      ...validCompletion,
      resultado: 'A'.repeat(1001),
    })
    expect(result.success).toBe(false)
  })
})

describe('Maintenance Validation - maintenanceFiltersSchema', () => {
  test('should accept empty filters with defaults', () => {
    const result = maintenanceFiltersSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(10)
      expect(result.data.sortBy).toBe('fechaProgramada')
      expect(result.data.sortOrder).toBe('asc')
    }
  })

  test('should accept valid filters', () => {
    const result = maintenanceFiltersSchema.safeParse({
      search: 'preventiva',
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      tipo: 'preventiva',
      estado: 'pendiente',
      fechaDesde: '2024-01-01',
      fechaHasta: '2024-12-31',
      pendientes: true,
      vencidas: false,
      page: 2,
      limit: 25,
      sortBy: 'tipo',
      sortOrder: 'desc',
    })
    expect(result.success).toBe(true)
  })

  test('should coerce pendientes to boolean', () => {
    const result = maintenanceFiltersSchema.safeParse({
      pendientes: 'true',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.pendientes).toBe(true)
    }
  })

  test('should reject invalid tipo filter', () => {
    const result = maintenanceFiltersSchema.safeParse({
      tipo: 'invalid-tipo',
    })
    expect(result.success).toBe(false)
  })

  test('should reject invalid estado filter', () => {
    const result = maintenanceFiltersSchema.safeParse({
      estado: 'invalid-estado',
    })
    expect(result.success).toBe(false)
  })

  test('should reject invalid sortBy field', () => {
    const result = maintenanceFiltersSchema.safeParse({
      sortBy: 'invalidField',
    })
    expect(result.success).toBe(false)
  })

  test('should accept all valid sortBy options', () => {
    const sortByOptions = [
      'fechaProgramada',
      'fechaRealizada',
      'createdAt',
      'tipo',
      'estado',
    ]

    sortByOptions.forEach((sortBy) => {
      const result = maintenanceFiltersSchema.safeParse({ sortBy })
      expect(result.success).toBe(true)
    })
  })
})
