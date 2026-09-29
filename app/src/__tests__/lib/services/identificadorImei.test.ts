/**
 * @jest-environment node
 */
// El IMEI identifica al celular donde no hay N° de serie (SPEC 2.112.7).
jest.mock('@/shared/prisma', () => ({ prisma: {} }));
// Solo se prueba el armado de la fila, no el PDF.
jest.mock('@react-pdf/renderer', () => ({ renderToBuffer: jest.fn() }));
jest.mock('@/modules/solicitudes/plantillas/AnexoEntregaTemplate', () => ({}));
jest.mock('@/modules/solicitudes/plantillas/ComprobanteEntregaTemplate', () => ({}));
jest.mock('@/modules/solicitudes/plantillas/ComprobanteCambioTemplate', () => ({}));
jest.mock('@/modules/solicitudes/plantillas/ActaDevolucionTemplate', () => ({}));

import { identificadorActivo } from '@/modules/activos/identificador';
import { filaEquipo } from '@/modules/solicitudes/documentos';

const base = {
  categoria: { nombre: 'Celular' },
  marca: 'Samsung',
  modelo: 'A55',
  pulgadas: null,
  ram: '8GB',
};

describe('identificador del equipo', () => {
  test('serie, o IMEI si no hay serie, o el texto de vacío', () => {
    expect(identificadorActivo({ numeroSerie: 'ABC', imei: '356938035643809' })).toBe('ABC');
    expect(identificadorActivo({ numeroSerie: null, imei: '356938035643809' })).toBe('IMEI 356938035643809');
    expect(identificadorActivo({ numeroSerie: null, imei: null }, '-')).toBe('-');
    expect(identificadorActivo(undefined)).toBe('Sin serie');
  });
});

describe('acta: fila del equipo', () => {
  test('celular sin serie: la columna muestra el IMEI y no se repite en especificaciones', () => {
    const fila = filaEquipo({ ...base, numeroSerie: null, imei: '356938035643809' }, 'OK', null);
    expect(fila.numeroSerie).toBe('356938035643809');
    expect(fila.especificaciones).not.toMatch(/IMEI/);
    expect(fila.especificaciones).toMatch(/Memoria RAM: 8GB/);
  });

  test('con serie: la columna muestra la serie y el IMEI va en especificaciones', () => {
    const fila = filaEquipo({ ...base, numeroSerie: 'R58N', imei: '356938035643809' }, 'OK', null);
    expect(fila.numeroSerie).toBe('R58N');
    expect(fila.especificaciones).toMatch(/IMEI: 356938035643809/);
  });
});
