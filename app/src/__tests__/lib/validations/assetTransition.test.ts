import {
  assetVentaSchema,
  motivoBajaEnum,
  resultadoMantencionEnum,
} from '@/lib/validations/assetTransition';

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
