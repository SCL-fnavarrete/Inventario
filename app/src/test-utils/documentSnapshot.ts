import { FIRMA_VALIDA } from './signature';
import type {
  ActaDevolucionSnapshot,
  AnexoEntregaSnapshot,
  ComprobanteCambioSnapshot,
  ComprobanteEntregaSnapshot,
} from '@/lib/documents/snapshot';

/**
 * Fixtures de snapshot para las pruebas de evidencia.
 *
 * Un snapshot es el documento: si una prueba lo construyera a partir de datos
 * vivos, dejaria de probar justamente lo que Task 6 garantiza.
 */

const EMPLEADO = {
  id: 'employee-1',
  nombreCompleto: 'Ada Lovelace',
  rut: '11.111.111-1',
  correo: 'ada@sclconsultores.com',
  cargo: 'Ingeniera de Software',
  fechaIngreso: '2026-01-15T00:00:00.000Z',
};

const ACTIVO = {
  assignmentId: 'assignment-1',
  assetId: 'asset-1',
  categoriaNombre: 'Notebook',
  tipoDevolucion: 'notebook' as const,
  marca: 'Lenovo',
  modelo: 'ThinkPad T14',
  numeroSerie: 'ABC123',
  condicion: 'nuevo',
  procesador: 'i7-1355U',
  ram: '16GB',
  discoDuro: '512GB SSD',
  sistemaOperativo: 'Windows 11',
  imei: null,
  numeroTelefono: null,
  operador: null,
};

const BASE = {
  snapshotVersion: 1 as const,
  numero: 'DOC-2026-0001',
  version: 1,
  emitidoEn: '2026-03-04T12:34:56.000Z',
  emitidoPor: 'Tecnico TI',
  empleado: EMPLEADO,
  solicitud: { id: 'request-1', numero: 'WF-2026-0007', tipo: 'onboarding' },
  aceptaPoliticaUso: true as const,
  firma: { imagenPng: FIRMA_VALIDA, firmadaEn: '2026-03-04T12:30:00.000Z' },
};

export function anexoEntregaSnapshot(
  overrides: Partial<AnexoEntregaSnapshot> = {}
): AnexoEntregaSnapshot {
  return {
    ...BASE,
    tipo: 'anexo_entrega',
    fechaEntrega: '2026-03-04T12:34:56.000Z',
    lugarEntrega: 'Santiago',
    gestionadoPor: 'Tecnico TI',
    activos: [ACTIVO],
    ...overrides,
  };
}

export function comprobanteEntregaSnapshot(
  overrides: Partial<ComprobanteEntregaSnapshot> = {}
): ComprobanteEntregaSnapshot {
  return {
    ...BASE,
    tipo: 'comprobante_entrega',
    fechaEntrega: '2026-03-04T12:34:56.000Z',
    gestionadoPor: 'Tecnico TI',
    activos: [ACTIVO],
    ...overrides,
  };
}

export function comprobanteCambioSnapshot(
  overrides: Partial<ComprobanteCambioSnapshot> = {}
): ComprobanteCambioSnapshot {
  return {
    ...BASE,
    tipo: 'comprobante_cambio',
    fecha: '2026-03-04T12:34:56.000Z',
    motivoCambio: 'Pantalla quebrada',
    gestionadoPor: 'Tecnico TI',
    equipoAnterior: {
      ...ACTIVO,
      assignmentId: 'assignment-0',
      assetId: 'asset-0',
      numeroSerie: 'OLD999',
      estadoDevolucion: 'ok',
    },
    equipoNuevo: ACTIVO,
    ...overrides,
  };
}

export function actaDevolucionSnapshot(
  overrides: Partial<ActaDevolucionSnapshot> = {}
): ActaDevolucionSnapshot {
  return {
    ...BASE,
    tipo: 'acta_devolucion',
    fechaInicio: '2026-01-15T00:00:00.000Z',
    fechaTermino: '2026-03-01T00:00:00.000Z',
    fechaDevolucion: '2026-03-04T12:34:56.000Z',
    lugarDevolucion: 'Santiago',
    recibidoPor: 'Tecnico TI',
    observaciones: 'Sin observaciones',
    activos: [{ ...ACTIVO, estadoDevolucion: 'ok' }],
    ...overrides,
  };
}
