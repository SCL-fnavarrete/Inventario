// Documento de una solicitud (SPEC 2.92): una sola regla para lista y detalle.
import { documentoDeSolicitud } from '@/lib/constants/documentosSolicitud';

describe('documentoDeSolicitud', () => {
  test('onboarding cerrado: Comprobante de Entrega', () => {
    expect(documentoDeSolicitud({ tipo: 'onboarding', estado: 'registro_rrhh' })?.tipo).toBe(
      'comprobante-entrega'
    );
  });

  test('cambio de equipo cerrado: Comprobante de Cambio', () => {
    expect(documentoDeSolicitud({ tipo: 'cambio_equipo', estado: 'confirmacion_rrhh' })?.tipo).toBe(
      'comprobante-cambio'
    );
  });

  test('desvinculacion: Acta solo si se devolvio algo (SPEC 2.87)', () => {
    expect(
      documentoDeSolicitud({ tipo: 'offboarding', estado: 'consolidacion_cierre', tieneActa: true })?.tipo
    ).toBe('acta-devolucion');
    expect(
      documentoDeSolicitud({ tipo: 'offboarding', estado: 'consolidacion_cierre', tieneActa: false })
    ).toBeNull();
    expect(documentoDeSolicitud({ tipo: 'offboarding', estado: 'consolidacion_cierre' })).toBeNull();
  });

  test('una solicitud sin ejecutar o cancelada no tiene documento', () => {
    expect(documentoDeSolicitud({ tipo: 'onboarding', estado: 'solicitud_recibida' })).toBeNull();
    expect(documentoDeSolicitud({ tipo: 'cambio_equipo', estado: 'cancelada' })).toBeNull();
  });
});
