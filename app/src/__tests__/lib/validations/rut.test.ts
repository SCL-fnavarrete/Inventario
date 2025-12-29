import {
  validarDigitoVerificador,
  formatearRut,
  limpiarRut,
  rutSchema,
  rutOptionalSchema,
} from '@/lib/validations/rut'

describe('RUT Validation - validarDigitoVerificador', () => {
  test('should validate correct RUTs', () => {
    // RUTs válidos conocidos
    expect(validarDigitoVerificador('21.523.308-1')).toBe(true)
    expect(validarDigitoVerificador('12.345.678-5')).toBe(true)
    expect(validarDigitoVerificador('11.111.111-1')).toBe(true)
    expect(validarDigitoVerificador('22.222.222-2')).toBe(true)
  })

  test('should validate RUTs with K as verification digit', () => {
    // RUT válido con dígito verificador K: 10.000.013-K
    expect(validarDigitoVerificador('10.000.013-K')).toBe(true)
    expect(validarDigitoVerificador('10000013K')).toBe(true)
  })

  test('should reject invalid RUTs', () => {
    expect(validarDigitoVerificador('21.523.308-2')).toBe(false)
    expect(validarDigitoVerificador('12.345.678-0')).toBe(false)
    expect(validarDigitoVerificador('11.111.111-2')).toBe(false)
  })

  test('should handle RUTs without dots or dashes', () => {
    expect(validarDigitoVerificador('215233081')).toBe(true)
    expect(validarDigitoVerificador('123456785')).toBe(true)
  })

  test('should handle lowercase k', () => {
    // RUT válido con dígito verificador K en minúscula: 10.000.013-k
    expect(validarDigitoVerificador('10.000.013-k')).toBe(true)
  })

  test('should reject too short RUTs', () => {
    expect(validarDigitoVerificador('1')).toBe(false)
    expect(validarDigitoVerificador('')).toBe(false)
  })
})

describe('RUT Formatting - formatearRut', () => {
  test('should format RUT with dots and dash', () => {
    expect(formatearRut('215233081')).toBe('21.523.308-1')
    expect(formatearRut('123456785')).toBe('12.345.678-5')
  })

  test('should handle already formatted RUTs', () => {
    expect(formatearRut('21.523.308-1')).toBe('21.523.308-1')
  })

  test('should handle partially formatted RUTs', () => {
    expect(formatearRut('21523308-1')).toBe('21.523.308-1')
    expect(formatearRut('21.5233081')).toBe('21.523.308-1')
  })

  test('should uppercase K verification digit', () => {
    expect(formatearRut('10000013k')).toBe('10.000.013-K')
    expect(formatearRut('10.000.013-k')).toBe('10.000.013-K')
  })

  test('should handle short RUTs (millions)', () => {
    expect(formatearRut('1234567-8')).toBe('1.234.567-8')
  })

  test('should return original for very short input', () => {
    expect(formatearRut('1')).toBe('1')
  })
})

describe('RUT Cleaning - limpiarRut', () => {
  test('should remove dots and dashes', () => {
    expect(limpiarRut('21.523.308-1')).toBe('215233081')
    expect(limpiarRut('12.345.678-5')).toBe('123456785')
  })

  test('should uppercase K', () => {
    expect(limpiarRut('10.000.013-k')).toBe('10000013K')
  })

  test('should handle already clean RUTs', () => {
    expect(limpiarRut('215233081')).toBe('215233081')
  })
})

describe('RUT Schema - rutSchema', () => {
  test('should accept valid RUTs', () => {
    const result = rutSchema.safeParse('21.523.308-1')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('21.523.308-1')
    }
  })

  test('should accept valid RUTs without formatting and transform them', () => {
    const result = rutSchema.safeParse('215233081')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('21.523.308-1')
    }
  })

  test('should reject empty string', () => {
    const result = rutSchema.safeParse('')
    expect(result.success).toBe(false)
  })

  test('should reject invalid format', () => {
    const result = rutSchema.safeParse('abc123')
    expect(result.success).toBe(false)
  })

  test('should reject valid format but invalid verification digit', () => {
    const result = rutSchema.safeParse('21.523.308-2')
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('dígito verificador')
    }
  })
})

describe('RUT Schema - rutOptionalSchema', () => {
  test('should accept null', () => {
    const result = rutOptionalSchema.safeParse(null)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeNull()
    }
  })

  test('should accept undefined', () => {
    const result = rutOptionalSchema.safeParse(undefined)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBeUndefined()
    }
  })

  test('should accept empty string', () => {
    const result = rutOptionalSchema.safeParse('')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('')
    }
  })

  test('should accept and format valid RUT', () => {
    const result = rutOptionalSchema.safeParse('215233081')
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data).toBe('21.523.308-1')
    }
  })
})
