import { resultadoMantencionEnum } from '@/modules/activos/validacionesTransicion';

// La venta de equipos se quitó (SPEC 2.141): ya no hay schema de venta.
// El cierre de mantencion usa `completeMaintenanceSchema`
// (modules/mantenciones/validaciones.ts), que reutiliza `resultadoMantencionEnum`.

// Enums
describe('resultadoMantencionEnum', () => {
  test('acepta los 3 resultados válidos', () => {
    ['reparado', 'no_reparable', 'pendiente_repuestos'].forEach((r) => {
      expect(resultadoMantencionEnum.safeParse(r).success).toBe(true);
    });
  });
});
