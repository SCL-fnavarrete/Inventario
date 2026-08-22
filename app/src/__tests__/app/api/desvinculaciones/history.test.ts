/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { email: 'rrhh@example.com' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    employee: { findUnique: jest.fn() },
    termination: { findFirst: jest.fn(), findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/desvinculaciones/route';
import { DELETE } from '@/app/api/desvinculaciones/[id]/route';
import { prisma } from '@/lib/prisma';

const employee = {
  id: '0beec7b5-ea3f-4f6c-a5e3-0b7f9c2c5e1a',
  rut: null,
  nombres: 'Ada',
  apellidoPaterno: 'Lovelace',
  apellidoMaterno: null,
  correo: 'ada@example.com',
  cargo: null,
  jefatura: null,
  supervisor: null,
  ubicacion: null,
  tipoContrato: 'externo',
  fechaIngreso: null,
  fechaTermino: null,
  estado: 'activo',
  telefonoContacto: null,
  origenMicrosoft: false,
  microsoftId: null,
  fechaEntregaEpp: null,
  fechaEntregaKit: null,
  proximaMantencionEpp: null,
};

function transactionWithEmployee(updatedEmployee: typeof employee) {
  const historyCreate = jest.fn().mockResolvedValue({ id: 'history-1' });
  const tx = {
    termination: {
      create: jest.fn().mockResolvedValue({ id: 'termination-1' }),
      delete: jest.fn().mockResolvedValue({ id: 'termination-1' }),
    },
    employee: { update: jest.fn().mockResolvedValue(updatedEmployee) },
    employeeHistory: { create: historyCreate },
  };
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => callback(tx));
  return { tx, historyCreate };
}

describe('desvinculación directa — historial de empleado', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('iniciar la desvinculación deja el cambio de estado en el mismo tx', async () => {
    (prisma.employee.findUnique as jest.Mock).mockResolvedValue({ ...employee, assignments: [] });
    (prisma.termination.findFirst as jest.Mock).mockResolvedValue(null);
    const { tx, historyCreate } = transactionWithEmployee({ ...employee, estado: 'desvinculado' });

    const response = await POST(
      new NextRequest('http://localhost/api/desvinculaciones', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          employeeId: '0beec7b5-ea3f-4f6c-a5e3-0b7f9c2c5e1a',
          fechaDesvinculacion: '2026-08-22',
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(tx.employee.update).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'desvinculacion' }) })
    );
  });

  test('revertir una desvinculación registra reactivación antes de borrar el proceso', async () => {
    (prisma.termination.findUnique as jest.Mock).mockResolvedValue({
      id: 'termination-1',
      employeeId: 'employee-1',
      estadoNotebook: 'pendiente',
      estadoCelular: 'pendiente',
      estadoMonitor: 'pendiente',
      estadoKit: 'pendiente',
      employee: { ...employee, estado: 'desvinculado' },
    });
    const { tx, historyCreate } = transactionWithEmployee(employee);

    const response = await DELETE(
      new NextRequest('http://localhost/api/desvinculaciones/termination-1'),
      {
        params: Promise.resolve({ id: 'termination-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(tx.employee.update).toHaveBeenCalledTimes(1);
    expect(tx.termination.delete).toHaveBeenCalledTimes(1);
    expect(historyCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tipoEvento: 'reactivacion' }) })
    );
  });
});
