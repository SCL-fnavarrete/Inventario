import {
  createMaintenanceSchema,
  updateMaintenanceSchema,
  completeMaintenanceSchema,
  maintenanceFiltersSchema,
  EstadoMantencionEnum,
  bajaEquipoSchema,
} from '@/modules/mantenciones/validaciones'

// El tipo de mantencion dejo de ser un enum fijo (9-sep-2026): ahora es una
// fila de MaintenanceType referenciada por id (uuid). Ver schema.prisma y
// src/modules/mantenciones/validaciones.ts.
const TIPO_ID = '6ba7b810-9dad-11d1-80b4-00c04fd430c8'

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
  // fechaProgramada es obligatoria: una mantencion no puede quedar "en
  // proceso" sin haber tenido nunca una fecha programada.
  const validMaintenance = {
    assetId: '550e8400-e29b-41d4-a716-446655440000',
    tipoId: TIPO_ID,
    descripcion: 'Mantencion preventiva trimestral',
    fechaProgramada: '2024-03-15',
  }

  test('should accept valid minimum maintenance data', () => {
    const result = createMaintenanceSchema.safeParse(validMaintenance)
    expect(result.success).toBe(true)
  })

  test('should accept full maintenance data', () => {
    const fullMaintenance = {
      ...validMaintenance,
      proximaMantencion: '2024-06-15',
      realizadoPor: 'Juan Tecnico',
      costo: 50000,
      proveedorExterno: 'TecnoService Ltda.',
    }

    const result = createMaintenanceSchema.safeParse(fullMaintenance)
    expect(result.success).toBe(true)
  })

  test('should transform fechaProgramada to Date', () => {
    const result = createMaintenanceSchema.safeParse(validMaintenance)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaProgramada).toBeInstanceOf(Date)
    }
  })

  test('should reject invalid fechaProgramada', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      fechaProgramada: 'not-a-date',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing fechaProgramada', () => {
    const { fechaProgramada, ...withoutFecha } = validMaintenance
    const result = createMaintenanceSchema.safeParse(withoutFecha)
    expect(result.success).toBe(false)
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

  test('should reject missing tipoId', () => {
    const { tipoId, ...maintenanceWithoutTipo } = validMaintenance
    const result = createMaintenanceSchema.safeParse(maintenanceWithoutTipo)
    expect(result.success).toBe(false)
  })

  test('should reject tipoId that is not a uuid', () => {
    const result = createMaintenanceSchema.safeParse({
      ...validMaintenance,
      tipoId: 'preventiva',
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

  test('should accept tipoId if it is a valid uuid', () => {
    const result = updateMaintenanceSchema.safeParse({ tipoId: TIPO_ID })
    expect(result.success).toBe(true)
  })

  test('should reject tipoId that is not a uuid', () => {
    const result = updateMaintenanceSchema.safeParse({
      tipoId: 'invalid-tipo',
    })
    expect(result.success).toBe(false)
  })

  test('acepta iniciar y cancelar', () => {
    expect(updateMaintenanceSchema.safeParse({ estado: 'en_proceso' }).success).toBe(true)
    expect(updateMaintenanceSchema.safeParse({ estado: 'cancelada' }).success).toBe(true)
  })

  test('rechaza completar por aca: tiene su propia ruta (SPEC 2.96)', () => {
    expect(updateMaintenanceSchema.safeParse({ estado: 'completada' }).success).toBe(false)
  })

  test('un campo que no viene no se toca (antes Iniciar borraba la fecha)', () => {
    const result = updateMaintenanceSchema.safeParse({ estado: 'en_proceso' })
    expect(result.success && 'fechaProgramada' in result.data && result.data.fechaProgramada !== undefined).toBe(false)
  })

  test('al editar, la fecha programada no puede quedar vacia', () => {
    expect(updateMaintenanceSchema.safeParse({ fechaProgramada: '' }).success).toBe(false)
    const result = updateMaintenanceSchema.safeParse({ fechaProgramada: '2026-10-01' })
    expect(result.success && result.data.fechaProgramada).toBeInstanceOf(Date)
  })

  test('hora opcional HH:MM; vacia queda en null; mal escrita se rechaza (SPEC 2.98)', () => {
    const ok = updateMaintenanceSchema.safeParse({ horaProgramada: '09:05' })
    expect(ok.success && ok.data.horaProgramada).toBe('09:05')
    const vacia = updateMaintenanceSchema.safeParse({ horaProgramada: '' })
    expect(vacia.success && vacia.data.horaProgramada).toBeNull()
    expect(updateMaintenanceSchema.safeParse({ horaProgramada: '25:00' }).success).toBe(false)
    expect(updateMaintenanceSchema.safeParse({ horaProgramada: '9:5' }).success).toBe(false)
  })

  test('si la hora no viene, no se toca', () => {
    const r = updateMaintenanceSchema.safeParse({ estado: 'en_proceso' })
    expect(r.success && r.data.horaProgramada).toBeUndefined()
  })

  test('should still validate descripcion constraints', () => {
    const result = updateMaintenanceSchema.safeParse({
      descripcion: '',
    })
    expect(result.success).toBe(false)
  })
})

describe('Maintenance Validation - completeMaintenanceSchema', () => {
  // 14-sep-2026 (SPEC 2.25): resultadoTipo ahora es requerido -- estas
  // pruebas quedaron desactualizadas cuando se agrego el campo (bloqueaba
  // el CI, "Tests + umbrales de cobertura").
  const validCompletion = {
    fechaRealizada: '2024-03-20',
    realizadoPor: 'Juan Tecnico',
    resultado: 'Mantencion completada exitosamente',
    resultadoTipo: 'reparado' as const,
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

  test('should reject missing resultadoTipo', () => {
    const { resultadoTipo, ...completionWithoutTipo } = validCompletion
    const result = completeMaintenanceSchema.safeParse(completionWithoutTipo)
    expect(result.success).toBe(false)
  })

  test('should accept resultadoTipo pendiente_repuestos without motivoBaja', () => {
    const result = completeMaintenanceSchema.safeParse({
      ...validCompletion,
      resultadoTipo: 'pendiente_repuestos',
    })
    expect(result.success).toBe(true)
  })

  test('should reject resultadoTipo no_reparable without motivoBaja', () => {
    const result = completeMaintenanceSchema.safeParse({
      ...validCompletion,
      resultadoTipo: 'no_reparable',
    })
    expect(result.success).toBe(false)
  })

  // SPEC 2.116.5: el motivo se elige de la lista; el detalle es aparte.
  test('should reject resultadoTipo no_reparable with only a detail', () => {
    const result = completeMaintenanceSchema.safeParse({
      ...validCompletion,
      resultadoTipo: 'no_reparable',
      motivoDetalle: 'Placa madre dañada',
    })
    expect(result.success).toBe(false)
  })

  test('should accept resultadoTipo no_reparable with a motive from the list', () => {
    const result = completeMaintenanceSchema.safeParse({
      ...validCompletion,
      resultadoTipo: 'no_reparable',
      motivoBajaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3309',
      motivoDetalle: 'Placa madre dañada, sin reparación posible',
    })
    expect(result.success).toBe(true)
  })
})

describe('Fechas obligatorias (SPEC 2.100)', () => {
  test('completar con la fecha vacia o mal escrita da error del campo, no una fecha invalida', () => {
    const base = { realizadoPor: 'QA', resultado: 'ok', resultadoTipo: 'reparado' }
    const vacia = completeMaintenanceSchema.safeParse({ ...base, fechaRealizada: '' })
    expect(vacia.success).toBe(false)
    if (!vacia.success) expect(vacia.error.issues[0].path).toEqual(['fechaRealizada'])
    expect(completeMaintenanceSchema.safeParse({ ...base, fechaRealizada: 'xx' }).success).toBe(false)
  })
})

describe('Maintenance Validation - maintenanceFiltersSchema', () => {
  test('should accept empty filters with defaults', () => {
    const result = maintenanceFiltersSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(10)
      // Sin sortBy: orden de agenda (SPEC 2.98)
      expect(result.data.sortBy).toBeUndefined()
      expect(result.data.sortOrder).toBe('asc')
    }
  })

  test('should accept valid filters', () => {
    const result = maintenanceFiltersSchema.safeParse({
      search: 'preventiva',
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      tipoId: TIPO_ID,
      estado: 'pendiente',
      fechaDesde: '2024-01-01',
      fechaHasta: '2024-12-31',
      pendientes: true,
      vencidas: false,
      page: 2,
      limit: 25,
      sortBy: 'tipoId',
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

  test('should reject tipoId that is not a uuid', () => {
    const result = maintenanceFiltersSchema.safeParse({
      tipoId: 'invalid-tipo',
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
      'tipoId',
      'estado',
    ]

    sortByOptions.forEach((sortBy) => {
      const result = maintenanceFiltersSchema.safeParse({ sortBy })
      expect(result.success).toBe(true)
    })
  })
})

// Baja directa del equipo, sin mantencion (SPEC 2.140)
describe('bajaEquipoSchema', () => {
  const valida = {
    motivoBajaId: '3f2504e0-4f89-41d3-9a0c-0305e82c3309',
    fechaBaja: '2026-09-23',
  }

  test('acepta una baja completa y convierte la fecha', () => {
    const r = bajaEquipoSchema.safeParse(valida)
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.fechaBaja).toBeInstanceOf(Date)
  })

  test('ya no pide tipo de mantención ni quién la realizó', () => {
    expect(bajaEquipoSchema.safeParse({ ...valida, observaciones: 'No enciende' }).success).toBe(true)
  })

  // Que "Otro" pida detalle lo revisa motivoParaBaja (conoce la lista).
  test('exige el motivo de la lista y una fecha valida', () => {
    expect(bajaEquipoSchema.safeParse({ ...valida, motivoBajaId: undefined }).success).toBe(false)
    expect(bajaEquipoSchema.safeParse({ ...valida, motivoBajaId: 'robo' }).success).toBe(false)
    expect(bajaEquipoSchema.safeParse({ ...valida, fechaBaja: 'ayer' }).success).toBe(false)
  })
})
