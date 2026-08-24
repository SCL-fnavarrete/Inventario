/** @jest-environment node */

/**
 * El cierre de una solicitud avisa a RRHH, y deja constancia de haberlo hecho.
 *
 * El orden vuelve a ser la regla: la fila `pendiente` se crea dentro de la
 * transaccion del cierre, y el correo sale despues del commit —y despues de
 * archivar los documentos, porque el adjunto tiene que ser el archivo
 * inmutable y no una copia hecha al vuelo.
 */

jest.mock('@/lib/auth/guard', () => ({
  ...jest.requireActual('@/lib/auth/guard'),
  requirePermission: jest.fn(),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { systemUser: { findUnique: jest.fn() }, $transaction: jest.fn() },
}));
jest.mock('@/lib/services/workflowExecutionService', () => ({
  executeAssignment: jest.fn(),
  executeReturn: jest.fn(),
  executeTerminationReturn: jest.fn(),
}));
jest.mock('@/lib/services/documentEmissionService', () => ({
  prepararEmision: jest.fn(),
  archivarDocumento: jest.fn(),
  documentoArchivadoDe: jest.fn(),
  TIMEOUT_TRANSACCION_EMISION_MS: 25000,
}));
jest.mock('@/lib/documents/snapshotBuilder', () => ({
  // El spread deja pasar los helpers puros del modulo -- `firmaDeEvidencias`,
  // que la ruta usa de verdad -- y mockea solo los constructores de snapshot.
  ...jest.requireActual('@/lib/documents/snapshotBuilder'),
  datosDeEntrega: jest.fn(async () => ({
    anexo: { tipo: 'anexo_entrega' },
    comprobante: { tipo: 'comprobante_entrega' },
  })),
  datosDeCambio: jest.fn(async () => ({ tipo: 'comprobante_cambio' })),
  datosDeDevolucion: jest.fn(async () => ({ tipo: 'acta_devolucion' })),
}));
jest.mock('@/lib/services/notificationService', () => ({
  prepararNotificacion: jest.fn(),
  enviarNotificacion: jest.fn(),
}));

import { POST } from '@/app/api/solicitudes/[id]/transicion/route';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { executeTerminationReturn } from '@/lib/services/workflowExecutionService';
import {
  archivarDocumento,
  documentoArchivadoDe,
  prepararEmision,
} from '@/lib/services/documentEmissionService';
import { enviarNotificacion, prepararNotificacion } from '@/lib/services/notificationService';
import { NextRequest } from 'next/server';
import { FIRMA_VALIDA } from '@/test-utils/signature';

let orden: string[];

function solicitud(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    numero: 'WF-2026-0007',
    tipo: 'onboarding',
    estado: 'equipos_entregados',
    employeeId: 'employee-1',
    employee: { id: 'employee-1', nombres: 'Ada', apellidoPaterno: 'Lovelace', rut: '11.111.111-1' },
    assignmentIds: [],
    motivoCambio: null,
    cargoSolicitado: 'Ingeniera',
    fechaDesvinculacion: null,
    terminationId: null,
    observaciones: null,
    ...overrides,
  };
}

function transaccionCon(datos: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const tx = {
    workflowRequest: {
      findUnique: jest.fn().mockResolvedValue(datos),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'request-1' }),
    },
    workflowTransition: { create: jest.fn().mockResolvedValue({}) },
    ...extra,
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
    const resultado = await callback(tx);
    orden.push('commit');
    return resultado;
  });
  return tx;
}

function pedirTransicion(body: Record<string, unknown>) {
  return POST(
    new NextRequest('http://localhost/api/solicitudes/request-1/transicion', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'request-1' }) }
  );
}

beforeEach(() => {
  orden = [];
  (requirePermission as jest.Mock).mockResolvedValue({
    user: { email: 'rrhh@example.com', id: 'user-1', role: 'rrhh' },
  });
  (prisma.systemUser.findUnique as jest.Mock).mockResolvedValue({
    id: 'system-1',
    nombre: 'Analista RRHH',
    rol: 'rrhh',
  });
  (documentoArchivadoDe as jest.Mock).mockImplementation(async ({ tipo }: { tipo: string }) =>
    tipo === 'anexo_entrega'
      ? { id: 'documento-anexo', numero: 'DOC-2026-0001', version: 1 }
      : { id: 'documento-comprobante', numero: 'DOC-2026-0002', version: 1 }
  );
  (prepararEmision as jest.Mock).mockImplementation(async (_tx, params) => {
    orden.push(`preparar-documento:${params.datos.tipo}`);
    return {
      documentoId: 'documento-acta',
      numero: 'DOC-2026-0003',
      version: 1,
      tipo: params.datos.tipo,
      hashSha256: 'a'.repeat(64),
    };
  });
  (archivarDocumento as jest.Mock).mockImplementation(async (documentoId: string) => {
    orden.push(`archivar:${documentoId}`);
    return { documentoId, archivoEstado: 'archivado', sharepointUrl: 'https://x/y.pdf', error: null };
  });
  (prepararNotificacion as jest.Mock).mockImplementation(async (_tx, params) => {
    orden.push(`preparar-notificacion:${params.tipo}`);
    return { notificacionId: 'notificacion-1', destinatarios: ['rrhh@sclconsultores.com'] };
  });
  (enviarNotificacion as jest.Mock).mockImplementation(async (notificacionId: string) => {
    orden.push(`enviar:${notificacionId}`);
    return { notificacionId, estado: 'enviada', error: null };
  });
});

describe('cierre de onboarding — registro_rrhh', () => {
  test('prepara una notificacion en la transaccion y la envia despues del commit', async () => {
    transaccionCon(solicitud());

    const response = await pedirTransicion({ nuevoEstado: 'registro_rrhh' });

    expect(response.status).toBe(200);
    expect(orden).toEqual([
      'preparar-notificacion:cierre_onboarding',
      'commit',
      'enviar:notificacion-1',
    ]);
    expect(prepararNotificacion).toHaveBeenCalledTimes(1);
  });

  test('adjunta los documentos ya archivados de la solicitud, no datos vivos', async () => {
    transaccionCon(solicitud());

    await pedirTransicion({ nuevoEstado: 'registro_rrhh' });

    const [, params] = (prepararNotificacion as jest.Mock).mock.calls[0];
    expect(params.documentoIds).toEqual(['documento-anexo', 'documento-comprobante']);
    expect(params.contexto).toEqual({ requestId: 'request-1' });
    expect(params.enviadaPor).toBe('Analista RRHH');
    expect(params.asunto).toContain('WF-2026-0007');
  });

  test('no adjunta un documento que nunca llego a archivarse', async () => {
    (documentoArchivadoDe as jest.Mock).mockResolvedValue(null);
    transaccionCon(solicitud());

    await pedirTransicion({ nuevoEstado: 'registro_rrhh' });

    const [, params] = (prepararNotificacion as jest.Mock).mock.calls[0];
    expect(params.documentoIds).toEqual([]);
  });

  test('la respuesta declara el resultado del aviso', async () => {
    transaccionCon(solicitud());

    const cuerpo = await (await pedirTransicion({ nuevoEstado: 'registro_rrhh' })).json();

    expect(cuerpo.notificaciones).toEqual([
      expect.objectContaining({ notificacionId: 'notificacion-1', estado: 'enviada' }),
    ]);
  });

  test('un fallo del correo no revierte el cierre', async () => {
    (enviarNotificacion as jest.Mock).mockResolvedValue({
      notificacionId: 'notificacion-1',
      estado: 'fallida',
      error: 'sendMail: Microsoft Graph respondio 403',
    });
    transaccionCon(solicitud());

    const response = await pedirTransicion({ nuevoEstado: 'registro_rrhh' });

    expect(response.status).toBe(200);
    expect((await response.json()).notificaciones[0].estado).toBe('fallida');
  });
});

describe('cierre de desvinculacion — consolidacion_cierre', () => {
  test('el correo sale despues de archivar el acta emitida en la misma transicion', async () => {
    transaccionCon(
      solicitud({
        tipo: 'devolucion_termino',
        estado: 'equipo_recibido',
        terminationId: 'termination-1',
        fechaDesvinculacion: new Date('2026-03-01T00:00:00.000Z'),
      }),
      {
        termination: {
          findUnique: jest.fn().mockResolvedValue({ id: 'termination-1', employeeId: 'employee-1' }),
        },
      }
    );
    (executeTerminationReturn as jest.Mock).mockResolvedValue({
      termination: { id: 'termination-1' },
      evidenciasParaDocumento: [
        {
          tipo: 'devolucion',
          assignmentId: 'assignment-1',
          employeeId: 'employee-1',
          terminationId: 'termination-1',
          firmaEmpleado: FIRMA_VALIDA,
          firmaEmpleadoEn: new Date('2026-03-04T12:30:00.000Z'),
          aceptaPoliticaUso: true,
        },
      ],
    });

    const response = await pedirTransicion({
      nuevoEstado: 'consolidacion_cierre',
      datosAccion: {
        estadoNotebook: 'ok',
        estadoCelular: 'no_aplica',
        estadoMonitor: 'no_aplica',
        estadoOtros: 'no_aplica',
        estadoKit: 'no_aplica',
        lugarDevolucion: 'Santiago',
        firmaEmpleadoDevolucion: FIRMA_VALIDA,
        aceptaPoliticaUso: true,
      },
    });

    expect(response.status).toBe(200);
    expect(orden).toEqual([
      'preparar-documento:acta_devolucion',
      'preparar-notificacion:cierre_desvinculacion',
      'commit',
      'archivar:documento-acta',
      'enviar:notificacion-1',
    ]);
    const [, params] = (prepararNotificacion as jest.Mock).mock.calls[0];
    expect(params.documentoIds).toEqual(['documento-acta']);
    expect(params.contexto).toEqual({ requestId: 'request-1', terminationId: 'termination-1' });
  });
});

describe('transiciones intermedias', () => {
  test('avanzar a gestion_ti no avisa a nadie', async () => {
    (prisma.systemUser.findUnique as jest.Mock).mockResolvedValue({
      id: 'system-1',
      nombre: 'Tecnico TI',
      rol: 'tecnico',
    });
    transaccionCon(solicitud({ estado: 'solicitud_recibida' }));

    await pedirTransicion({ nuevoEstado: 'gestion_ti' });

    expect(prepararNotificacion).not.toHaveBeenCalled();
    expect(enviarNotificacion).not.toHaveBeenCalled();
  });
});
