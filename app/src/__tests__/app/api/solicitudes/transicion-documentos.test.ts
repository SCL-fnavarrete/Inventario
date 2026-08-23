/** @jest-environment node */

/**
 * La transicion de una solicitud emite la evidencia del acto.
 *
 * El orden es la regla: la fila del documento se crea **dentro** de la
 * transaccion —si el negocio se revierte, la evidencia se revierte con el— y
 * la subida a SharePoint ocurre **despues del commit**, porque Graph no
 * participa de la transaccion y un tenant caido no puede deshacer una entrega
 * que ya paso fisicamente.
 */

jest.mock('@/lib/auth/guard', () => ({
  ...jest.requireActual('@/lib/auth/guard'),
  requirePermission: jest
    .fn()
    .mockResolvedValue({ user: { email: 'tecnico@example.com', id: 'user-1', role: 'tecnico' } }),
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
  TIMEOUT_TRANSACCION_EMISION_MS: 25000,
}));
jest.mock('@/lib/documents/snapshotBuilder', () => ({
  datosDeEntrega: jest.fn(async () => ({
    anexo: { tipo: 'anexo_entrega' },
    comprobante: { tipo: 'comprobante_entrega' },
  })),
  datosDeCambio: jest.fn(async () => ({ tipo: 'comprobante_cambio' })),
  datosDeDevolucion: jest.fn(async () => ({ tipo: 'acta_devolucion' })),
}));

import { POST } from '@/app/api/solicitudes/[id]/transicion/route';
import { prisma } from '@/lib/prisma';
import {
  executeAssignment,
  executeReturn,
  executeTerminationReturn,
} from '@/lib/services/workflowExecutionService';
import { archivarDocumento, prepararEmision } from '@/lib/services/documentEmissionService';
import { datosDeDevolucion, datosDeEntrega } from '@/lib/documents/snapshotBuilder';
import { NextRequest } from 'next/server';
import { FIRMA_VALIDA } from '@/test-utils/signature';

const ASSET_ID = '550e8400-e29b-41d4-a716-446655440001';
let orden: string[];

function solicitud(overrides: Record<string, unknown> = {}) {
  return {
    id: 'request-1',
    numero: 'WF-2026-0007',
    tipo: 'onboarding',
    estado: 'gestion_ti',
    employeeId: 'employee-1',
    employee: { id: 'employee-1' },
    assignmentIds: [],
    motivoCambio: null,
    cargoSolicitado: 'Ingeniera',
    fechaDesvinculacion: null,
    terminationId: null,
    observaciones: null,
    ...overrides,
  };
}

function transaccionCon(datosSolicitud: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  const tx = {
    workflowRequest: {
      findUnique: jest.fn().mockResolvedValue(datosSolicitud),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({ id: 'request-1' }),
    },
    workflowTransition: { create: jest.fn().mockResolvedValue({}) },
    ...extra,
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback, opciones) => {
    const resultado = await callback(tx);
    orden.push(`commit(timeout=${opciones?.timeout ?? 'default'})`);
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
  (prisma.systemUser.findUnique as jest.Mock).mockResolvedValue({
    id: 'system-1',
    nombre: 'Tecnico TI',
    rol: 'tecnico',
  });
  let secuencia = 0;
  (prepararEmision as jest.Mock).mockImplementation(async (_tx, params) => {
    secuencia += 1;
    orden.push(`preparar:${params.datos.tipo}`);
    return {
      documentoId: `documento-${secuencia}`,
      numero: `DOC-2026-000${secuencia}`,
      version: 1,
      tipo: params.datos.tipo,
      hashSha256: 'a'.repeat(64),
    };
  });
  (archivarDocumento as jest.Mock).mockImplementation(async (documentoId: string) => {
    orden.push(`archivar:${documentoId}`);
    return { documentoId, archivoEstado: 'archivado', sharepointUrl: 'https://x/y.pdf', error: null };
  });
});

describe('onboarding — entrega de equipos', () => {
  test('prepara anexo y comprobante en la transaccion y archiva despues del commit', async () => {
    transaccionCon(solicitud());
    (executeAssignment as jest.Mock).mockResolvedValue({
      assignment: { id: 'assignment-1' },
      evidenciaParaDocumento: {
        tipo: 'entrega',
        assignmentId: 'assignment-1',
        employeeId: 'employee-1',
        firmaEmpleado: FIRMA_VALIDA,
        firmaEmpleadoEn: new Date('2026-03-04T12:30:00.000Z'),
        aceptaPoliticaUso: true,
      },
    });

    const response = await pedirTransicion({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: [ASSET_ID],
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega: FIRMA_VALIDA,
        aceptaPoliticaUso: true,
      },
    });

    expect(response.status).toBe(200);
    expect(orden).toEqual([
      'preparar:anexo_entrega',
      'preparar:comprobante_entrega',
      'commit(timeout=25000)',
      'archivar:documento-1',
      'archivar:documento-2',
    ]);
  });

  test('el acta se arma con las asignaciones creadas en esta transicion', async () => {
    transaccionCon(solicitud());
    (executeAssignment as jest.Mock).mockResolvedValue({
      assignment: { id: 'assignment-1' },
      evidenciaParaDocumento: {
        tipo: 'entrega',
        assignmentId: 'assignment-1',
        employeeId: 'employee-1',
        firmaEmpleado: FIRMA_VALIDA,
        firmaEmpleadoEn: new Date('2026-03-04T12:30:00.000Z'),
        aceptaPoliticaUso: true,
      },
    });

    await pedirTransicion({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: [ASSET_ID],
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega: FIRMA_VALIDA,
        aceptaPoliticaUso: true,
      },
    });

    const [, params] = (datosDeEntrega as jest.Mock).mock.calls[0];
    expect(params.assignmentIds).toEqual(['assignment-1']);
    expect(params.cargoSolicitado).toBe('Ingeniera');
    expect(params.gestionadoPor).toBe('Tecnico TI');
  });

  test('un fallo al archivar no revierte la entrega: la declara y deja reintentar', async () => {
    transaccionCon(solicitud());
    (executeAssignment as jest.Mock).mockResolvedValue({
      assignment: { id: 'assignment-1' },
      evidenciaParaDocumento: {
        tipo: 'entrega',
        assignmentId: 'assignment-1',
        employeeId: 'employee-1',
        firmaEmpleado: FIRMA_VALIDA,
        firmaEmpleadoEn: new Date('2026-03-04T12:30:00.000Z'),
        aceptaPoliticaUso: true,
      },
    });
    (archivarDocumento as jest.Mock).mockResolvedValue({
      documentoId: 'documento-1',
      archivoEstado: 'fallido',
      sharepointUrl: null,
      error: 'No se pudo archivar el documento en SharePoint: 403',
    });

    const response = await pedirTransicion({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: [ASSET_ID],
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega: FIRMA_VALIDA,
        aceptaPoliticaUso: true,
      },
    });

    expect(response.status).toBe(200);
    const cuerpo = await response.json();
    expect(cuerpo.documentos).toEqual(
      expect.arrayContaining([expect.objectContaining({ archivoEstado: 'fallido' })])
    );
  });

  test('la respuesta no devuelve la firma del empleado', async () => {
    transaccionCon(solicitud());
    (executeAssignment as jest.Mock).mockResolvedValue({
      assignment: { id: 'assignment-1' },
      evidenciaParaDocumento: {
        tipo: 'entrega',
        assignmentId: 'assignment-1',
        employeeId: 'employee-1',
        firmaEmpleado: FIRMA_VALIDA,
        firmaEmpleadoEn: new Date('2026-03-04T12:30:00.000Z'),
        aceptaPoliticaUso: true,
      },
    });

    const response = await pedirTransicion({
      nuevoEstado: 'equipos_entregados',
      datosAccion: {
        assetIds: [ASSET_ID],
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega: FIRMA_VALIDA,
        aceptaPoliticaUso: true,
      },
    });

    expect(JSON.stringify(await response.json())).not.toContain('data:image/png');
  });
});

describe('cambio de equipo', () => {
  test('emite el comprobante de cambio con el equipo que sale y el que entra', async () => {
    transaccionCon(
      solicitud({ tipo: 'cambio_equipo', estado: 'incidencia_detectada', motivoCambio: 'Pantalla quebrada' })
    );
    (executeReturn as jest.Mock).mockResolvedValue({
      assignment: { id: 'assignment-vieja' },
      evidenciaParaDocumento: {
        tipo: 'devolucion',
        assignmentId: 'assignment-vieja',
        employeeId: 'employee-1',
        firmaEmpleado: FIRMA_VALIDA,
        firmaEmpleadoEn: new Date('2026-03-04T12:30:00.000Z'),
        aceptaPoliticaUso: true,
      },
    });
    (executeAssignment as jest.Mock).mockResolvedValue({
      assignment: { id: 'assignment-nueva' },
      evidenciaParaDocumento: {
        tipo: 'entrega',
        assignmentId: 'assignment-nueva',
        employeeId: 'employee-1',
        firmaEmpleado: FIRMA_VALIDA,
        firmaEmpleadoEn: new Date('2026-03-04T12:30:00.000Z'),
        aceptaPoliticaUso: true,
      },
    });

    const response = await pedirTransicion({
      nuevoEstado: 'cambio_ejecutado',
      datosAccion: {
        oldAssignmentId: '550e8400-e29b-41d4-a716-4466554400aa',
        estadoDevolucion: 'danado',
        newAssetId: ASSET_ID,
        lugarEntrega: 'Santiago',
        firmaEmpleadoEntrega: FIRMA_VALIDA,
        firmaEmpleadoDevolucion: FIRMA_VALIDA,
        aceptaPoliticaUso: true,
      },
    });

    expect(response.status).toBe(200);
    expect(orden).toEqual([
      'preparar:comprobante_cambio',
      'commit(timeout=25000)',
      'archivar:documento-1',
    ]);
  });
});

describe('devolucion por termino', () => {
  test('emite el acta con las asignaciones que la desvinculacion cerro', async () => {
    // El cierre de una devolucion por termino lo ejecuta RRHH (SPEC 2.5.2).
    (prisma.systemUser.findUnique as jest.Mock).mockResolvedValue({
      id: 'system-2',
      nombre: 'Analista RRHH',
      rol: 'rrhh',
    });
    transaccionCon(
      solicitud({
        tipo: 'devolucion_termino',
        estado: 'equipo_recibido',
        terminationId: 'termination-1',
        fechaDesvinculacion: new Date('2026-03-01T00:00:00.000Z'),
      }),
      { termination: { findUnique: jest.fn().mockResolvedValue({ id: 'termination-1', employeeId: 'employee-1' }) } }
    );
    (executeTerminationReturn as jest.Mock).mockResolvedValue({
      termination: { id: 'termination-1', lugarDevolucion: 'Santiago' },
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
        {
          tipo: 'devolucion',
          assignmentId: 'assignment-2',
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
        estadoKit: 'no_aplica',
        lugarDevolucion: 'Santiago',
        firmaEmpleadoDevolucion: FIRMA_VALIDA,
        aceptaPoliticaUso: true,
      },
    });

    expect(response.status).toBe(200);
    expect(orden).toEqual(['preparar:acta_devolucion', 'commit(timeout=25000)', 'archivar:documento-1']);
    const [, params] = (datosDeDevolucion as jest.Mock).mock.calls[0];
    expect(params.assignmentIds).toEqual(['assignment-1', 'assignment-2']);
    expect(params.recibidoPor).toBe('Analista RRHH');
    const [, emision] = (prepararEmision as jest.Mock).mock.calls[0];
    expect(emision.contexto.terminationId).toBe('termination-1');
  });
});
