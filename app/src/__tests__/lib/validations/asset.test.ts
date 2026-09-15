import {
  createAssetSchema,
  updateAssetSchema,
  estadoActivoEnum,
  condicionActivoEnum,
} from '@/lib/validations/asset'

describe('Asset Validation - estadoActivoEnum', () => {
  test('should accept valid estados', () => {
    const validEstados = [
      'disponible',
      'asignado',
      'en_mantencion',
      'baja',
      'vendido',
    ]

    validEstados.forEach((estado) => {
      const result = estadoActivoEnum.safeParse(estado)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid estado', () => {
    const result = estadoActivoEnum.safeParse('invalido')
    expect(result.success).toBe(false)
  })

  // (15-sep-2026, SPEC 2.40) "reutilizable" se fusiono en "disponible": era
  // identico en la practica y hacia que las alertas de stock, que solo
  // contaban "disponible", avisaran "Sin Stock" con equipos listos para
  // entregar. Que el equipo ya se uso lo dice `condicion`.
  test('should reject the removed estado reutilizable', () => {
    const result = estadoActivoEnum.safeParse('reutilizable')
    expect(result.success).toBe(false)
  })
})

describe('Asset Validation - condicionActivoEnum', () => {
  test('should accept valid condiciones', () => {
    const validCondiciones = ['nuevo', 'usado', 'danado']

    validCondiciones.forEach((condicion) => {
      const result = condicionActivoEnum.safeParse(condicion)
      expect(result.success).toBe(true)
    })
  })

  test('should reject invalid condicion', () => {
    const result = condicionActivoEnum.safeParse('roto')
    expect(result.success).toBe(false)
  })
})

describe('Asset Validation - createAssetSchema', () => {
  const validAsset = {
    categoriaId: '550e8400-e29b-41d4-a716-446655440000',
    marca: 'LENOVO',
    modelo: 'ThinkPad X1 Carbon',
  }

  test('should accept valid minimum asset data', () => {
    const result = createAssetSchema.safeParse(validAsset)
    expect(result.success).toBe(true)
  })

  test('should accept full asset data', () => {
    const fullAsset = {
      ...validAsset,
      numeroSerie: 'PF3BXB9T',
      imei: '354964992749902',
      procesador: 'Intel Core i7-1260P',
      discoDuro: '512 GB',
      ram: '16 GB',
      pulgadas: 14.0,
      sistemaOperativo: 'Windows 11 Pro',
      numeroTelefono: '+56996191268',
      numeroActivacion: '123456',
      tipoPlan: 'Full',
      tieneCargador: true,
      estado: 'disponible',
      condicion: 'nuevo',
      ubicacionFisica: 'Bodega Santiago',
      microsoft365: true,
      intuneEnrolled: true,
      listaDistribucion: 'team@empresa.cl',
      fechaCompra: '2024-01-15T00:00:00.000Z',
      fechaGarantiaFin: '2027-01-15T00:00:00.000Z',
      observaciones: 'Equipo nuevo para desarrollo',
    }

    const result = createAssetSchema.safeParse(fullAsset)
    expect(result.success).toBe(true)
  })

  test('should reject missing categoriaId', () => {
    const { categoriaId, ...assetWithoutCategoria } = validAsset
    const result = createAssetSchema.safeParse(assetWithoutCategoria)
    expect(result.success).toBe(false)
  })

  test('should reject invalid categoriaId format', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      categoriaId: 'not-a-uuid',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing marca', () => {
    const { marca, ...assetWithoutMarca } = validAsset
    const result = createAssetSchema.safeParse(assetWithoutMarca)
    expect(result.success).toBe(false)
  })

  test('should reject empty marca', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      marca: '',
    })
    expect(result.success).toBe(false)
  })

  test('should reject missing modelo', () => {
    const { modelo, ...assetWithoutModelo } = validAsset
    const result = createAssetSchema.safeParse(assetWithoutModelo)
    expect(result.success).toBe(false)
  })

  test('should reject marca exceeding 50 characters', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      marca: 'A'.repeat(51),
    })
    expect(result.success).toBe(false)
  })

  test('should reject modelo exceeding 100 characters', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      modelo: 'A'.repeat(101),
    })
    expect(result.success).toBe(false)
  })

  test('should reject negative pulgadas', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      pulgadas: -14,
    })
    expect(result.success).toBe(false)
  })

  test('should accept zero as valid for optional numeric fields', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      pulgadas: 0,
    })
    expect(result.success).toBe(false) // 0 is not positive
  })

  test('should default estado to disponible', () => {
    const result = createAssetSchema.safeParse(validAsset)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.estado).toBe('disponible')
    }
  })

  test('should default condicion to nuevo', () => {
    const result = createAssetSchema.safeParse(validAsset)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.condicion).toBe('nuevo')
    }
  })

  test('should accept null for optional string fields', () => {
    const result = createAssetSchema.safeParse({
      ...validAsset,
      numeroSerie: null,
      observaciones: null,
    })
    expect(result.success).toBe(true)
  })
})

describe('Asset Validation - updateAssetSchema', () => {
  test('should accept partial data', () => {
    const result = updateAssetSchema.safeParse({
      marca: 'DELL',
    })
    expect(result.success).toBe(true)
  })

  test('should accept empty object', () => {
    const result = updateAssetSchema.safeParse({})
    expect(result.success).toBe(true)
  })

  test('should still validate field constraints', () => {
    const result = updateAssetSchema.safeParse({
      marca: 'A'.repeat(51),
    })
    expect(result.success).toBe(false)
  })

  test('should accept status change', () => {
    const result = updateAssetSchema.safeParse({
      estado: 'asignado',
    })
    expect(result.success).toBe(true)
  })

  test('should reject invalid estado', () => {
    const result = updateAssetSchema.safeParse({
      estado: 'estado_invalido',
    })
    expect(result.success).toBe(false)
  })
})
