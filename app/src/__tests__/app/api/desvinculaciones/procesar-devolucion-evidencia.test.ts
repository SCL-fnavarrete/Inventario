/** @jest-environment node */

/**
 * La desvinculación directa también emite su acta y avisa a RRHH.
 *
 * El SPEC 2.1 septies afirma que `POST /notificar` "cubre la desvinculación
 * directa —la que no nació de una solicitud— y el reintento. Exige que el acta
 * de devolución esté archivada". Pero el único camino directo,
 * `procesar-devolucion`, no preparaba ninguna emisión ni notificación: cerraba
 * la devolución y nada más.
 *
 * El resultado era un callejón sin salida por diseño. El operador procesaba la
 * devolución, intentaba notificar, y recibía un 409 que decía "Cierre la
 * devolución para emitirla" sobre una devolución ya cerrada. Y `POST
 * .../documento/[tipo]` tampoco servía: responde 409 cuando el contexto nunca
 * emitió el documento, a propósito, porque crear hoy la evidencia de un acto de
 * hace meses sería fabricarla.
 */

jest.mock('@/lib/auth/guard', () => ({
  ...jest.requireActual('@/lib/auth/guard'),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('@/lib/services/workflowExecutionService', () => ({
  executeTerminationReturn: jest.fn(),
}));
jest.mock('@/lib/documents/snapshotBuilder', () => ({
  ...jest.requireActual('@/lib/documents/snapshotBuilder'),
  datosDeDevolucion: jest.fn(),
}));
jest.mock('@/lib/services/documentEmissionService', () => ({
  prepararEmision: jest.fn(),
  archivarDocumento: jest.fn(),
}));
jest.mock('@/lib/services/notificationService', () => ({
  prepararNotificacion: jest.fn(),
  enviarNotificacion: jest.fn(),
}));

import { POST } from '@/app/api/desvinculaciones/[id]/procesar-devolucion/route';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { executeTerminationReturn } from '@/lib/services/workflowExecutionService';
import { datosDeDevolucion } from '@/lib/documents/snapshotBuilder';
import { archivarDocumento, prepararEmision } from '@/lib/services/documentEmissionService';
import { enviarNotificacion, prepararNotificacion } from '@/lib/services/notificationService';
import { NextRequest } from 'next/server';
import { FIRMA_VALIDA } from '@/test-utils/signature';

const PARAMS = { params: Promise.resolve({ id: 'termination-1' }) };

const CUERPO = {
  fechaDevolucionEquipos: '2026-03-04T12:00:00.000Z',
  estadoNotebook: 'ok',
  estadoCelular: 'no_aplica',
  estadoMonitor: 'no_aplica',
  estadoOtros: 'no_aplica',
  estadoKit: 'no_aplica',
  recibidoPor: 'Tecnico TI',
  lugarDevolucion: 'Santiago',
  firmaEmpleadoDevolucion: FIRMA_VALIDA,
  aceptaPoliticaUso: true,
  observaciones: null,
};

const EVIDENCIA = {
  assignmentId: 'assignment-1',
  assetId: 'asset-1',
  firmaEmpleado: FIRMA_VALIDA,
  firmaEmpleadoEn: new Date('2026-03-04T11:59:00.000Z'),
};

const TX = {
  termination: {
    findUnique: jest.fn(async () => ({
      id: 'termination-1',
      employeeId: 'employee-1',
      fechaDesvinculacion: new Date('2026-03-01T00:00:00.000Z'),
      employee: { nombres: 'Ada', apellidoPaterno: 'Lovelace', rut: '11.111.111-1' },
    })),
  },
};

function pedir(overrides: Record<string, unknown> = {}) {
  return POST(
    new NextRequest('http://localhost/api/desvinculaciones/termination-1/procesar-devolucion', {
      method: 'POST',
      body: JSON.stringify({ ...CUERPO, ...overrides }),
      headers: { 'content-type': 'application/json' },
    }),
    PARAMS
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue({
    user: { name: 'Analista RRHH', email: 'rrhh@sclconsultores.com' },
  });
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(TX));
  (executeTerminationReturn as jest.Mock).mockResolvedValue({
    termination: { id: 'termination-1' },
    evidenciasParaDocumento: [EVIDENCIA],
  });
  (datosDeDevolucion as jest.Mock).mockResolvedValue({ tipo: 'acta_devolucion' });
  (prepararEmision as jest.Mock).mockResolvedValue({
    documentoId: 'documento-1',
    numero: 'DOC-2026-0001',
    version: 1,
    tipo: 'acta_devolucion',
    hashSha256: 'abc',
  });
  (archivarDocumento as jest.Mock).mockResolvedValue({
    documentoId: 'documento-1',
    archivoEstado: 'archivado',
    sharepointUrl: 'https://contoso/DOC-2026-0001-v1.pdf',
    error: null,
  });
  (prepararNotificacion as jest.Mock).mockResolvedValue({
    notificacionId: 'notificacion-1',
    destinatarios: ['rrhh@sclconsultores.com'],
  });
  (enviarNotificacion as jest.Mock).mockResolvedValue({
    notificacionId: 'notificacion-1',
    estado: 'enviada',
    error: null,
  });
});

describe('POST /api/desvinculaciones/[id]/procesar-devolucion', () => {
  test('emite el acta dentro de la misma transacción que cierra la devolución', async () => {
    await pedir();

    expect(prepararEmision).toHaveBeenCalledTimes(1);
    // El contexto lleva la desvinculación, no una solicitud: es el camino
    // directo, y sin ese vínculo `/notificar` nunca encontraría el acta.
    expect(prepararEmision).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({
        contexto: expect.objectContaining({
          employeeId: 'employee-1',
          terminationId: 'termination-1',
        }),
      })
    );
    // Y con las asignaciones exactas que el cierre devolvió, no con lo que el
    // empleado tenga después.
    expect(datosDeDevolucion).toHaveBeenCalledWith(
      TX,
      expect.objectContaining({ assignmentIds: ['assignment-1'] })
    );
  });

  test('archiva y avisa a RRHH después del commit, no dentro', async () => {
    const orden: string[] = [];
    (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
      const resultado = await callback(TX);
      orden.push('commit');
      return resultado;
    });
    (archivarDocumento as jest.Mock).mockImplementation(async () => {
      orden.push('archivar');
      return {
        documentoId: 'documento-1',
        archivoEstado: 'archivado',
        sharepointUrl: null,
        error: null,
      };
    });
    (enviarNotificacion as jest.Mock).mockImplementation(async () => {
      orden.push('notificar');
      return { notificacionId: 'notificacion-1', estado: 'enviada', error: null };
    });

    await pedir();

    expect(orden).toEqual(['commit', 'archivar', 'notificar']);
  });

  test('la respuesta dice qué pasó con el acta y con el aviso', async () => {
    const response = await pedir();

    expect(response.status).toBe(200);
    const cuerpo = await response.json();
    expect(cuerpo.documentos).toEqual([
      expect.objectContaining({ tipo: 'acta_devolucion', archivoEstado: 'archivado' }),
    ]);
    expect(cuerpo.notificaciones).toEqual([expect.objectContaining({ estado: 'enviada' })]);
  });

  test('un fallo de archivo no revierte la devolución', async () => {
    (archivarDocumento as jest.Mock).mockResolvedValue({
      documentoId: 'documento-1',
      archivoEstado: 'fallido',
      sharepointUrl: null,
      error: 'SharePoint 503',
    });

    const response = await pedir();

    expect(response.status).toBe(200);
    const cuerpo = await response.json();
    expect(cuerpo.documentos[0].archivoEstado).toBe('fallido');
  });
});
