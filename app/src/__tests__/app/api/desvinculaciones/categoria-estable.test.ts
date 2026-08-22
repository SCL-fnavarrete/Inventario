/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({}),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    employee: { findUnique: jest.fn() },
    termination: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { POST } from '@/app/api/desvinculaciones/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const employeeId = '0beec7b5-ea3f-4f6c-a5e3-0b7f9c2c5e1a';

function request() {
  return new NextRequest('http://localhost/api/desvinculaciones', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ employeeId, fechaDesvinculacion: '2026-08-22' }),
  });
}

function configureEmployee(nombre: string, tipoDevolucion: string) {
  (prisma.employee.findUnique as jest.Mock).mockResolvedValue({
    id: employeeId,
    assignments: [
      {
        asset: {
          categoria: { nombre, tipoDevolucion },
        },
      },
    ],
  });
  (prisma.termination.findFirst as jest.Mock).mockResolvedValue(null);
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) => {
    const tx = {
      termination: {
        create: jest
          .fn()
          .mockImplementation(async ({ data }) => ({ id: 'termination-1', ...data })),
      },
      employee: { update: jest.fn().mockResolvedValue({}) },
    };
    return callback(tx);
  });
}

describe('POST /api/desvinculaciones — categoría estable', () => {
  test('marca notebook pendiente aunque la categoría se llame Laptop', async () => {
    configureEmployee('Laptop', 'notebook');

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      estadoNotebook: 'pendiente',
      estadoCelular: 'no_aplica',
      estadoMonitor: 'no_aplica',
    });
  });

  test('marca notebook no_aplica si una categoría llamada Notebook tiene tipo otro', async () => {
    configureEmployee('Notebook', 'otro');

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      estadoNotebook: 'no_aplica',
      estadoCelular: 'no_aplica',
      estadoMonitor: 'no_aplica',
    });
  });
});
