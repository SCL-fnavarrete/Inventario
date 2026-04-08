import {
  createEmployeeSchema,
  updateEmployeeSchema,
  employeeFiltersSchema,
  importEmployeeSchema,
  TipoContratoEnum,
  EstadoEmpleadoEnum,
} from '@/lib/validations/employee'

describe('Employee Validation - TipoContratoEnum', () => {
  test('should accept valid tipos de contrato', () => {
    const validTipos = ['planta', 'proyecto', 'externo']

    validTipos.forEach((tipo) => {
      const result = TipoContratoEnum.safeParse(tipo)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid tipo', () => {
    const result = TipoContratoEnum.safeParse('temporal')
    expect(result.success).toBe(false)
  })
})

describe('Employee Validation - EstadoEmpleadoEnum', () => {
  test('should accept valid estados', () => {
    const validEstados = ['activo', 'desvinculado', 'licencia']

    validEstados.forEach((estado) => {
      const result = EstadoEmpleadoEnum.safeParse(estado)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid estado', () => {
    const result = EstadoEmpleadoEnum.safeParse('inactivo')
    expect(result.success).toBe(false)
  })
})

describe('Employee Validation - createEmployeeSchema', () => {
  const validEmployee = {
    rut: '21.523.308-1',
    nombres: 'Juan Carlos',
    apellidoPaterno: 'Perez',
    correo: 'jperez@empresa.cl',
    tipoContrato: 'planta' as const,
  }

  test('should accept valid minimum employee data', () => {
    const result = createEmployeeSchema.safeParse(validEmployee)
    expect(result.success).toBe(true)
  })

  test('should accept full employee data', () => {
    const fullEmployee = {
      ...validEmployee,
      apellidoMaterno: 'Garcia',
      cargo: 'Desarrollador Senior',
      jefatura: 'Gerencia TI',
      supervisor: 'Maria Rodriguez',
      ubicacion: 'Santiago',
      fechaIngreso: '2024-01-15',
      fechaTermino: '2024-12-31',
      estado: 'activo' as const,
      telefonoContacto: '+56912345678',
    }

    const result = createEmployeeSchema.safeParse(fullEmployee)
    expect(result.success).toBe(true)
  })

  test('should accept missing RUT (RUT is optional — employees from Microsoft Entra ID may not have it)', () => {
    const { rut, ...employeeWithoutRut } = validEmployee
    const result = createEmployeeSchema.safeParse(employeeWithoutRut)
    expect(result.success).toBe(true)
  })

  test('should reject invalid RUT format', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      rut: '12345',
    })
    expect(result.success).toBe(false)
  })

  test('should reject invalid RUT verification digit', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      rut: '21.523.308-2',
    })
    expect(result.success).toBe(false)
  })

  test('should transform RUT to formatted version', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      rut: '215233081',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.rut).toBe('21.523.308-1')
    }
  })

  test('should reject missing nombres', () => {
    const { nombres, ...employeeWithoutNombres } = validEmployee
    const result = createEmployeeSchema.safeParse(employeeWithoutNombres)
    expect(result.success).toBe(false)
  })

  test('should reject empty nombres', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      nombres: '',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing apellidoPaterno', () => {
    const { apellidoPaterno, ...employeeWithoutApellido } = validEmployee
    const result = createEmployeeSchema.safeParse(employeeWithoutApellido)
    expect(result.success).toBe(false)
  })

  test('should reject invalid email format', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      correo: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing tipoContrato', () => {
    const { tipoContrato, ...employeeWithoutContrato } = validEmployee
    const result = createEmployeeSchema.safeParse(employeeWithoutContrato)
    expect(result.success).toBe(false)
  })

  test('should default estado to activo', () => {
    const result = createEmployeeSchema.safeParse(validEmployee)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.estado).toBe('activo')
    }
  })

  test('should transform fechaIngreso string to Date', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      fechaIngreso: '2024-01-15',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaIngreso).toBeInstanceOf(Date)
    }
  })

  test('should handle invalid date strings gracefully', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      fechaIngreso: 'not-a-date',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaIngreso).toBeNull()
    }
  })

  test('should accept null for optional fields', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      apellidoMaterno: null,
      cargo: null,
      telefonoContacto: null,
    })
    expect(result.success).toBe(true)
  })

  test('should reject nombres exceeding 100 characters', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      nombres: 'A'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  test('should reject correo exceeding 150 characters', () => {
    const result = createEmployeeSchema.safeParse({
      ...validEmployee,
      correo: 'a'.repeat(140) + '@empresa.cl',
    })
    expect(result.success).toBe(false)
  })
})

describe('Employee Validation - updateEmployeeSchema', () => {
  test('should accept partial data', () => {
    const result = updateEmployeeSchema.safeParse({
      nombres: 'Juan Carlos Updated',
    })
    expect(result.success).toBe(true)
  })

  test('should accept empty object', () => {
    const result = updateEmployeeSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('should validate RUT if provided', () => {
    const result = updateEmployeeSchema.safeParse({
      rut: 'invalid-rut',
    })
    expect(result.success).toBe(false)
  })

  test('should validate email if provided', () => {
    const result = updateEmployeeSchema.safeParse({
      correo: 'not-an-email',
    })
    expect(result.success).toBe(false)
  })

  test('should accept estado change', () => {
    const result = updateEmployeeSchema.safeParse({
      estado: 'desvinculado',
    })
    expect(result.success).toBe(true)
  })
})

describe('Employee Validation - employeeFiltersSchema', () => {
  test('should accept empty filters with defaults', () => {
    const result = employeeFiltersSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(1)
      expect(result.data.limit).toBe(10)
      expect(result.data.sortBy).toBe('nombres')
      expect(result.data.sortOrder).toBe('asc')
    }
  })

  test('should accept valid filters', () => {
    const result = employeeFiltersSchema.safeParse({
      search: 'juan',
      estado: 'activo',
      tipoContrato: 'planta',
      ubicacion: 'Santiago',
      page: 2,
      limit: 25,
      sortBy: 'rut',
      sortOrder: 'desc',
    })
    expect(result.success).toBe(true)
  })

  test('should coerce page from string', () => {
    const result = employeeFiltersSchema.safeParse({
      page: '5',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.page).toBe(5)
    }
  })

  test('should reject page less than 1', () => {
    const result = employeeFiltersSchema.safeParse({
      page: 0,
    })
    expect(result.success).toBe(false)
  })

  test('should reject limit greater than 100', () => {
    const result = employeeFiltersSchema.safeParse({
      limit: 150,
    })
    expect(result.success).toBe(false)
  })

  test('should reject invalid sortBy field', () => {
    const result = employeeFiltersSchema.safeParse({
      sortBy: 'invalidField',
    })
    expect(result.success).toBe(false)
  })

  test('should reject invalid sortOrder', () => {
    const result = employeeFiltersSchema.safeParse({
      sortOrder: 'random',
    })
    expect(result.success).toBe(false)
  })
})

describe('Employee Validation - importEmployeeSchema', () => {
  const validImportData = {
    rut: '21.523.308-1',
    nombres: 'Juan Carlos',
    apellidoPaterno: 'Perez',
    correo: 'jperez@empresa.cl',
    tipoContrato: 'planta',
  }

  test('should accept valid import data', () => {
    const result = importEmployeeSchema.safeParse(validImportData)
    expect(result.success).toBe(true)
  })

  test('should transform tipoContrato to lowercase', () => {
    const result = importEmployeeSchema.safeParse({
      ...validImportData,
      tipoContrato: 'PLANTA',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tipoContrato).toBe('planta')
    }
  })

  test('should default invalid tipoContrato to proyecto', () => {
    const result = importEmployeeSchema.safeParse({
      ...validImportData,
      tipoContrato: 'temporal',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.tipoContrato).toBe('proyecto')
    }
  })

  test('should transform fechaIngreso string to Date', () => {
    const result = importEmployeeSchema.safeParse({
      ...validImportData,
      fechaIngreso: '2024-01-15',
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.fechaIngreso).toBeInstanceOf(Date)
    }
  })
})
