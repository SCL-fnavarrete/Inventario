/** @jest-environment node */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { id: 'user-1', role: 'tecnico' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: { assignment: { findUnique: jest.fn() } },
}));

import { GET } from '@/app/api/asignaciones/[id]/acta/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

describe('GET /api/asignaciones/[id]/acta — evidencia oficial', () => {
  test('bloquea un acta de entrega heredada sin firma y timestamp oficiales', async () => {
    (prisma.assignment.findUnique as jest.Mock).mockResolvedValue({
      id: 'assignment-1', firmaEmpleadoEntrega: null, firmaEmpleadoEntregaEn: null,
      firmaEmpleadoDevolucion: null, firmaEmpleadoDevolucionEn: null,
    });

    const response = await GET(
      new NextRequest('http://localhost/api/asignaciones/assignment-1/acta?tipo=entrega'),
      { params: Promise.resolve({ id: 'assignment-1' }) }
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: 'No existe evidencia oficial de entrega para esta asignación' });
  });
});
