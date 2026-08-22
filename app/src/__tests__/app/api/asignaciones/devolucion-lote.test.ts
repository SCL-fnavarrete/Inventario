/** @jest-environment node */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { id: 'user-1', role: 'tecnico' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));
jest.mock('@/lib/prisma', () => ({ prisma: { $transaction: jest.fn() } }));
jest.mock('@/lib/services/workflowExecutionService', () => ({ executeReturn: jest.fn() }));

import { POST } from '@/app/api/asignaciones/devolucion-lote/route';
import { prisma } from '@/lib/prisma';
import { executeReturn } from '@/lib/services/workflowExecutionService';
import { NextRequest } from 'next/server';

import { FIRMA_VALIDA } from '@/test-utils/signature';
const signature = FIRMA_VALIDA;
const employeeId = '550e8400-e29b-41d4-a716-446655440000';

function request(policy = true, overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/asignaciones/devolucion-lote', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      assignmentIds: ['550e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440002'],
      employeeId, fechaDevolucion: '2026-08-22', recibidoPor: 'Técnico TI', estadoDevolucion: 'ok',
      firmaEmpleadoDevolucion: signature, aceptaPoliticaUso: policy,
      ...overrides,
    }),
  });
}

describe('POST /api/asignaciones/devolucion-lote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (prisma.$transaction as jest.Mock).mockImplementation((callback) => callback({}));
    (executeReturn as jest.Mock).mockImplementation((_tx, params, context) => ({
      assignment: { id: params.assignmentId },
      evidenciaParaDocumento: { tipo: 'devolucion', assignmentId: params.assignmentId, employeeId, firmaEmpleado: signature, firmaEmpleadoEn: context.eventTimestamp, aceptaPoliticaUso: true },
    }));
  });

  test('procesa todas las asignaciones dentro de una sola transacción con el mismo timestamp de evidencia', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(executeReturn).toHaveBeenCalledTimes(2);
    const firstContext = (executeReturn as jest.Mock).mock.calls[0][2];
    const secondContext = (executeReturn as jest.Mock).mock.calls[1][2];
    expect(firstContext.expectedEmployeeId).toBe(employeeId);
    expect(firstContext.eventTimestamp).toBe(secondContext.eventTimestamp);
  });

  /**
   * Sin `employeeId` el servicio comparaba la asignación consigo misma, así que
   * un lote con asignaciones de empleados distintos se cerraba entero con una
   * sola firma. La ruta debe rechazarlo antes de abrir la transacción.
   */
  test('rechaza el acto que no declara a su empleado, antes de tocar la base', async () => {
    const response = await POST(request(true, { employeeId: undefined }));

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(executeReturn).not.toHaveBeenCalled();
  });

  test('no permite omitir la aceptación literal de política por la ruta batch', async () => {
    const response = await POST(request(false));

    expect(response.status).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(executeReturn).not.toHaveBeenCalled();
  });
});
