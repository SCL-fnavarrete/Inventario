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

import { POST } from '@/app/api/solicitudes/[id]/transicion/route';
import { prisma } from '@/lib/prisma';
import { executeAssignment } from '@/lib/services/workflowExecutionService';
import { NextRequest } from 'next/server';

const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL3pgAAAABJRU5ErkJggg==';

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
