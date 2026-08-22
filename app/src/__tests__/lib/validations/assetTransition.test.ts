import { FIRMA_VALIDA } from '@/test-utils/signature';
import {
  assetBajaSchema,
  assetVentaSchema,
  maintenanceCloseSchema,
  assetReassignmentSchema,
  motivoBajaEnum,
  resultadoMantencionEnum,
} from '@/lib/validations/assetTransition';

// SPEC: Sección 2.7.3 — Proceso de Baja
describe('assetBajaSchema', () => {
  const validBaja = {
    motivo: 'obsolescencia' as const,
    condicionFinal: 'usado' as const,
  };

  test('acepta baja válida con motivo y condición', () => {
    expect(assetBajaSchema.safeParse(validBaja).success).toBe(true);
  });

  test('acepta todos los motivos válidos', () => {
    const motivos = ['obsolescencia', 'falla_irreparable', 'robo', 'extravio', 'otro'] as const;
    motivos.forEach((motivo) => {
      const data = motivo === 'otro'
        ? { ...validBaja, motivo, motivoDetalle: 'Motivo personalizado' }
        : { ...validBaja, motivo };
      expect(assetBajaSchema.safeParse(data).success).toBe(true);
    });
  });

  test('rechaza motivo inválido', () => {
    expect(assetBajaSchema.safeParse({ ...validBaja, motivo: 'inventado' }).success).toBe(false);
  });

  test('rechaza condición final inválida', () => {
    expect(assetBajaSchema.safeParse({ ...validBaja, condicionFinal: 'nuevo' }).success).toBe(false);
  });

  test('motivo "otro" sin detalle es inválido', () => {
    const result = assetBajaSchema.safeParse({ ...validBaja, motivo: 'otro' });
    expect(result.success).toBe(false);
  });

  test('motivo "otro" con detalle es válido', () => {
    const result = assetBajaSchema.safeParse({
      ...validBaja,
      motivo: 'otro',
      motivoDetalle: 'Equipo perdido en traslado',
    });
    expect(result.success).toBe(true);
  });

  test('motivo "otro" con detalle vacío es inválido', () => {
    const result = assetBajaSchema.safeParse({
      ...validBaja,
      motivo: 'otro',
      motivoDetalle: '',
    });
    expect(result.success).toBe(false);
  });

  test('motivo no-otro sin detalle es válido', () => {
    const result = assetBajaSchema.safeParse({
      motivo: 'robo',
      condicionFinal: 'danado',
    });
    expect(result.success).toBe(true);
  });
});

// SPEC: Sección 2.7.4 — Proceso de Venta
describe('assetVentaSchema', () => {
  const validVenta = {
    comprador: 'Empresa ABC',
    monto: 150000,
    moneda: 'CLP' as const,
    fechaVenta: '2026-04-07',
  };

  test('acepta venta válida', () => {
    expect(assetVentaSchema.safeParse(validVenta).success).toBe(true);
  });

  test('rechaza sin comprador', () => {
    const { comprador, ...sin } = validVenta;
    expect(assetVentaSchema.safeParse(sin).success).toBe(false);
  });

  test('rechaza comprador vacío', () => {
    expect(assetVentaSchema.safeParse({ ...validVenta, comprador: '' }).success).toBe(false);
  });

  test('rechaza monto negativo', () => {
    expect(assetVentaSchema.safeParse({ ...validVenta, monto: -1000 }).success).toBe(false);
  });

  test('rechaza monto cero', () => {
    expect(assetVentaSchema.safeParse({ ...validVenta, monto: 0 }).success).toBe(false);
  });

  test('acepta moneda USD', () => {
    expect(assetVentaSchema.safeParse({ ...validVenta, moneda: 'USD' }).success).toBe(true);
  });

  test('moneda por defecto es CLP', () => {
    const { moneda, ...sinMoneda } = validVenta;
    const result = assetVentaSchema.safeParse(sinMoneda);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.moneda).toBe('CLP');
    }
  });

  test('rechaza sin fechaVenta', () => {
    const { fechaVenta, ...sin } = validVenta;
    expect(assetVentaSchema.safeParse(sin).success).toBe(false);
  });

  test('acepta documentoVenta como URL válida', () => {
    const result = assetVentaSchema.safeParse({
      ...validVenta,
      documentoVenta: 'https://drive.google.com/doc/123',
    });
    expect(result.success).toBe(true);
  });

  test('rechaza documentoVenta como URL inválida', () => {
    const result = assetVentaSchema.safeParse({
      ...validVenta,
      documentoVenta: 'no-es-url',
    });
    expect(result.success).toBe(false);
  });
});

// SPEC: Sección 2.7.5 — Cierre de Mantención
describe('maintenanceCloseSchema', () => {
  const validClose = {
    resultadoEstructurado: 'reparado' as const,
    realizadoPor: 'Técnico IT',
  };

  test('acepta cierre reparado válido', () => {
    expect(maintenanceCloseSchema.safeParse(validClose).success).toBe(true);
  });

  test('acepta cierre pendiente_repuestos', () => {
    const result = maintenanceCloseSchema.safeParse({
      ...validClose,
      resultadoEstructurado: 'pendiente_repuestos',
    });
    expect(result.success).toBe(true);
  });

  test('rechaza sin realizadoPor', () => {
    const { realizadoPor, ...sin } = validClose;
    expect(maintenanceCloseSchema.safeParse(sin).success).toBe(false);
  });

  test('no_reparable sin motivoBaja es inválido', () => {
    const result = maintenanceCloseSchema.safeParse({
      ...validClose,
      resultadoEstructurado: 'no_reparable',
    });
    expect(result.success).toBe(false);
  });

  test('no_reparable con motivoBaja vacío es inválido', () => {
    const result = maintenanceCloseSchema.safeParse({
      ...validClose,
      resultadoEstructurado: 'no_reparable',
      motivoBaja: '',
    });
    expect(result.success).toBe(false);
  });

  test('no_reparable con motivoBaja es válido', () => {
    const result = maintenanceCloseSchema.safeParse({
      ...validClose,
      resultadoEstructurado: 'no_reparable',
      motivoBaja: 'Placa madre dañada, sin reparación posible',
    });
    expect(result.success).toBe(true);
  });

  test('acepta campos opcionales', () => {
    const result = maintenanceCloseSchema.safeParse({
      ...validClose,
      costo: 50000,
      proveedorExterno: 'Servicio Técnico Lenovo',
      proximaMantencion: '2026-10-01',
    });
    expect(result.success).toBe(true);
  });
});

// SPEC: Sección 2.7.6 — Reasignación
describe('assetReassignmentSchema', () => {
  const firmaPng =
    FIRMA_VALIDA;
  const validReassignment = {
    assignmentId: '550e8400-e29b-41d4-a716-446655440000',
    newEmployeeId: '550e8400-e29b-41d4-a716-446655440001',
    estadoDevolucion: 'ok' as const,
    motivoReasignacion: 'Cambio de área del empleado',
    fechaReasignacion: '2026-04-07',
    lugarEntrega: 'Oficina Santiago',
    firmaEmpleadoDevolucion: firmaPng,
    aceptaPoliticaUsoDevolucion: true,
    firmaEmpleadoEntrega: firmaPng,
    aceptaPoliticaUsoEntrega: true,
  };

  test('acepta reasignación válida', () => {
    expect(assetReassignmentSchema.safeParse(validReassignment).success).toBe(true);
  });

  test('bloquea una reasignación directa sin aceptación de política en ambos actos', () => {
    expect(
      assetReassignmentSchema.safeParse({
        ...validReassignment,
        aceptaPoliticaUsoEntrega: false,
      }).success
    ).toBe(false);
  });

  test('rechaza sin motivoReasignacion', () => {
    const { motivoReasignacion, ...sin } = validReassignment;
    expect(assetReassignmentSchema.safeParse(sin).success).toBe(false);
  });

  test('rechaza motivoReasignacion vacío', () => {
    expect(
      assetReassignmentSchema.safeParse({ ...validReassignment, motivoReasignacion: '' }).success
    ).toBe(false);
  });

  test('acepta estadoDevolucion ok', () => {
    expect(
      assetReassignmentSchema.safeParse({ ...validReassignment, estadoDevolucion: 'ok' }).success
    ).toBe(true);
  });

  test('acepta estadoDevolucion incompleto', () => {
    expect(
      assetReassignmentSchema.safeParse({ ...validReassignment, estadoDevolucion: 'incompleto' }).success
    ).toBe(true);
  });

  test('rechaza estadoDevolucion danado (no se puede reasignar equipo dañado)', () => {
    expect(
      assetReassignmentSchema.safeParse({ ...validReassignment, estadoDevolucion: 'danado' }).success
    ).toBe(false);
  });

  test('rechaza assignmentId no UUID', () => {
    expect(
      assetReassignmentSchema.safeParse({ ...validReassignment, assignmentId: 'no-uuid' }).success
    ).toBe(false);
  });

  test('acepta campos opcionales', () => {
    const result = assetReassignmentSchema.safeParse({
      ...validReassignment,
      lugarEntrega: 'Oficina Santiago',
      entregadoPor: 'P. Ortega',
    });
    expect(result.success).toBe(true);
  });
});

// Enums
describe('motivoBajaEnum', () => {
  test('acepta los 5 motivos válidos', () => {
    ['obsolescencia', 'falla_irreparable', 'robo', 'extravio', 'otro'].forEach((m) => {
      expect(motivoBajaEnum.safeParse(m).success).toBe(true);
    });
  });
});

describe('resultadoMantencionEnum', () => {
  test('acepta los 3 resultados válidos', () => {
    ['reparado', 'no_reparable', 'pendiente_repuestos'].forEach((r) => {
      expect(resultadoMantencionEnum.safeParse(r).success).toBe(true);
    });
  });
});
