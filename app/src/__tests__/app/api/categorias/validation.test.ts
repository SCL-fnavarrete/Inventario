/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({}),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    assetCategory: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue({
        id: 'category-1',
        requiereSerie: true,
        requiereImei: false,
      }),
      create: jest.fn().mockResolvedValue({ id: 'category-1' }),
      update: jest.fn().mockResolvedValue({ id: 'category-1' }),
    },
  },
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/categorias/route';
import { PUT } from '@/app/api/categorias/[id]/route';

describe('API categorías — tipoDevolucion', () => {
  test('rechaza en creación un payload con tipo de devolución inválido', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/categorias', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: 'Laptop', tipoDevolucion: 'impresora' }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });

  test('rechaza en actualización un payload con tipo de devolución inválido', async () => {
    const response = await PUT(
      new NextRequest('http://localhost/api/categorias/category-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: 'Laptop', tipoDevolucion: 'impresora' }),
      }),
      { params: Promise.resolve({ id: 'category-1' }) }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
  });
});
