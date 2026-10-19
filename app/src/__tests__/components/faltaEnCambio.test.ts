/**
 * Lo que le falta a un equipo marcado en un Cambio de equipo (SPEC 2.143, 2.160):
 * un celular de reemplazo sin linea se puede entregar asi.
 */
import {
  faltaEnCambio,
  type ItemCambioEquipo,
} from '@/modules/solicitudes/componentes/SeleccionarCambioEquipo';
import { SIN_LINEA } from '@/modules/solicitudes/componentes/nueva/ElegirLineaCelular';

const base: ItemCambioEquipo = {
  oldAssignmentId: 'a1',
  newAssetId: 'nuevo',
  estadoDevolucion: 'ok',
  motivoBajaId: '',
  motivoBajaDetalle: '',
  motivoPideDetalle: false,
  observaciones: '',
  condicionCargadorAnterior: '',
  observacionesCargadorAnterior: '',
  condicionCargadorNuevo: '',
  observacionesCargadorNuevo: '',
  lineaNueva: SIN_LINEA,
  esCelular: true,
  modoCelular: 'chip',
  esimLineaId: '',
  convertirEsim: false,
  pasarLinea: false,
};

describe('faltaEnCambio', () => {
  test('un celular de reemplazo sin línea está completo: la línea es opcional', () => {
    expect(faltaEnCambio(base)).toBeNull();
  });

  test('con eSIM sigue pidiendo cuál eSIM', () => {
    expect(faltaEnCambio({ ...base, modoCelular: 'esim', newAssetId: '' })).toBe('la eSIM');
  });

  test('con eSIM y su misma línea convertida, no pide elegir otra (SPEC 2.166)', () => {
    expect(
      faltaEnCambio({ ...base, modoCelular: 'esim', newAssetId: '', convertirEsim: true })
    ).toBeNull();
  });

  test('sin reemplazo ni modo, avisa lo que falta', () => {
    expect(faltaEnCambio({ ...base, modoCelular: '', newAssetId: '' })).toBe(
      'si es chip físico o eSIM y el reemplazo'
    );
  });
});
