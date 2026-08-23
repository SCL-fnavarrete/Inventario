/** @jest-environment node */

jest.mock('@/lib/auth/guard', () => ({
  ...jest.requireActual('@/lib/auth/guard'),
  requirePermission: jest.fn().mockResolvedValue({ user: { email: 'tecnico@example.com', id: 'user-1', role: 'tecnico' } }),
}));
jest.mock('@/lib/prisma', () => ({
  prisma: { systemUser: { findUnique: jest.fn() }, $transaction: jest.fn() },
}));
jest.mock('@/lib/services/workflowExecutionService', () => ({
  executeAssignment: jest.fn(), executeReturn: jest.fn(), executeTerminationReturn: jest.fn(),
}));
// La emision de evidencia tiene su propia suite (transicion-documentos). Aqui
// se dobla para no arrastrar el renderizador de PDF, que es ESM con WASM.
jest.mock('@/lib/services/documentEmissionService', () => ({
  prepararEmision: jest.fn(async () => ({
    documentoId: 'documento-1', numero: 'DOC-2026-0001', version: 1,
    tipo: 'anexo_entrega', hashSha256: 'a'.repeat(64),
  })),
  archivarDocumento: jest.fn(async (documentoId: string) => ({
    documentoId, archivoEstado: 'archivado', sharepointUrl: 'https://x/y.pdf', error: null,
  })),
  documentoArchivadoDe: jest.fn(async () => null),
  TIMEOUT_TRANSACCION_EMISION_MS: 25000,
}));
// El aviso a RRHH tiene su propia suite (transicion-notificaciones).
jest.mock('@/lib/services/notificationService', () => ({
  prepararNotificacion: jest.fn(async () => ({
    notificacionId: 'notificacion-1', destinatarios: ['rrhh@sclconsultores.com'],
  })),
  enviarNotificacion: jest.fn(async (notificacionId: string) => ({
    notificacionId, estado: 'enviada', error: null,
  })),
}));
jest.mock('@/lib/documents/snapshotBuilder', () => ({
  datosDeEntrega: jest.fn(async () => ({
    anexo: { tipo: 'anexo_entrega' }, comprobante: { tipo: 'comprobante_entrega' },
  })),
  datosDeCambio: jest.fn(async () => ({ tipo: 'comprobante_cambio' })),
  datosDeDevolucion: jest.fn(async () => ({ tipo: 'acta_devolucion' })),
}));

import { POST } from '@/app/api/solicitudes/[id]/transicion/route';
import { prisma } from '@/lib/prisma';
import { executeAssignment } from '@/lib/services/workflowExecutionService';
import { NextRequest } from 'next/server';

import { FIRMA_VALIDA } from '@/test-utils/signature';
const signature = FIRMA_VALIDA;

describe('POST /api/solicitudes/[id]/transicion — CAS', () => {
  test('no ejecuta entrega si otro request ya reclamó el estado de la solicitud', async () => {
    (prisma.systemUser.findUnique as jest.Mock).mockResolvedValue({ id: 'system-1', nombre: 'Técnico', rol: 'tecnico' });
    (prisma.$transaction as jest.Mock).mockImplementation((callback) => callback({
      workflowRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1', tipo: 'onboarding', estado: 'gestion_ti', employeeId: 'employee-1',
          employee: { id: 'employee-1' }, assignmentIds: [], numero: 'WF-1', motivoCambio: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    }));

    const response = await POST(new NextRequest('http://localhost/api/solicitudes/request-1/transicion', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nuevoEstado: 'equipos_entregados',
        datosAccion: {
          assetIds: ['550e8400-e29b-41d4-a716-446655440001'], lugarEntrega: 'Santiago',
          firmaEmpleadoEntrega: signature, aceptaPoliticaUso: true,
        },
      }),
    }), { params: Promise.resolve({ id: 'request-1' }) });

    expect(response.status).toBe(409);
    expect(executeAssignment).not.toHaveBeenCalled();
  });
});

/**
 * La firma tiene un solo lugar canónico: `Assignment`, de donde Task 6 la toma
 * para sellar el documento inmutable.
 *
 * La transición guardaba `datosAccion` tal como llegó, así que la misma imagen
 * base64 —hasta 256 KB— quedaba también en la tabla de auditoría. Y como
 * `GET /api/solicitudes/[id]` incluye las transiciones completas, cada carga de
 * la ficha devolvía todas las firmas de la solicitud a cualquier rol que pueda
 * leerla.
 */
describe('POST /api/solicitudes/[id]/transicion — la auditoría no guarda la firma', () => {
  function transaccionQueRegistra() {
    const transitionCreate = jest.fn().mockResolvedValue({});
    const tx = {
      workflowRequest: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'request-1', tipo: 'onboarding', estado: 'gestion_ti', employeeId: 'employee-1',
          employee: { id: 'employee-1' }, assignmentIds: [], numero: 'WF-1', motivoCambio: null,
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'request-1', estado: 'equipos_entregados' }),
      },
      workflowTransition: { create: transitionCreate },
    };
    (prisma.$transaction as jest.Mock).mockImplementation((callback) => callback(tx));
    return { transitionCreate };
  }

  test('registra la transición sin la imagen de la firma, pero deja constancia de que existió', async () => {
    (prisma.systemUser.findUnique as jest.Mock).mockResolvedValue({ id: 'system-1', nombre: 'Técnico', rol: 'tecnico' });
    (executeAssignment as jest.Mock).mockResolvedValue({
      assignment: { id: 'assignment-1' },
      evidenciaParaDocumento: { tipo: 'entrega', assignmentId: 'assignment-1' },
    });
    const { transitionCreate } = transaccionQueRegistra();

    const response = await POST(new NextRequest('http://localhost/api/solicitudes/request-1/transicion', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nuevoEstado: 'equipos_entregados',
        datosAccion: {
          assetIds: ['550e8400-e29b-41d4-a716-446655440001'], lugarEntrega: 'Santiago',
          firmaEmpleadoEntrega: signature, aceptaPoliticaUso: true,
        },
      }),
    }), { params: Promise.resolve({ id: 'request-1' }) });

    expect(response.status).toBe(200);
    const persistido = transitionCreate.mock.calls[0][0].data.datosAccion;
    expect(JSON.stringify(persistido)).not.toContain('data:image/png');
    expect(persistido.lugarEntrega).toBe('Santiago');
    expect(persistido.assetIds).toEqual(['550e8400-e29b-41d4-a716-446655440001']);
    expect(persistido.firmaEntregaRegistrada).toBe(true);
  });
});
