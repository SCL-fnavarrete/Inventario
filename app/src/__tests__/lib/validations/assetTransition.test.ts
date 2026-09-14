import {
  assetBajaSchema,
  assetVentaSchema,
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

  test('rechaza fechaVenta con formato inválido', () => {
    expect(() =>
      assetVentaSchema.parse({ ...validVenta, fechaVenta: 'no-es-una-fecha' })
    ).toThrow();
  });
});

// Nota (14-sep-2026, SPEC 2.25): se quitaron aqui las pruebas de
// `documentoVenta` (el campo ya no existe en assetVentaSchema -- vender un
// activo ya no requiere documento) y el describe completo de
// `maintenanceCloseSchema` (ese schema se elimino; el cierre de mantencion
// ahora usa `completeMaintenanceSchema` en lib/validations/maintenance.ts,
// que reutiliza `resultadoMantencionEnum` de este mismo archivo -- ver
// pruebas de ese enum mas abajo).

// SPEC: Sección 2.7.6 — Reasignación
describe('assetReassignmentSchema', () => {
  const validReassignment = {
    assignmentId: '550e8400-e29b-41d4-a716-446655440000',
    newEmployeeId: '550e8400-e29b-41d4-a716-446655440001',
    estadoDevolucion: 'ok' as const,
    motivoReasignacion: 'Cambio de área del empleado',
    fechaReasignacion: '2026-04-07',
  };

  test('acepta reasignación válida', () => {
    expect(assetReassignmentSchema.safeParse(validReassignment).success).toBe(true);
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

  test('rechaza fechaReasignacion con formato inválido', () => {
    expect(() =>
      assetReassignmentSchema.parse({ ...validReassignment, fechaReasignacion: 'no-es-una-fecha' })
    ).toThrow();
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
