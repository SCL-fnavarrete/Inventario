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
      findMany: jest.fn().mockResolvedValue([]),
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
import { GET, POST } from '@/app/api/categorias/route';
import { PUT } from '@/app/api/categorias/[id]/route';
import { prisma } from '@/lib/prisma';

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

  test('crea categorías sin tipo explícito con el valor estable otro', async () => {
    (prisma.assetCategory.create as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: 'category-2', ...data })
    );

    const response = await POST(
      new NextRequest('http://localhost/api/categorias', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: 'Periféricos' }),
      })
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      nombre: 'Periféricos',
      tipoDevolucion: 'otro',
    });
  });

  test('actualiza solamente el tipo de devolución sin exigir nombre', async () => {
    (prisma.assetCategory.findUnique as jest.Mock).mockResolvedValue({
      id: 'category-1',
      nombre: 'Laptop',
      requiereSerie: true,
      requiereImei: false,
      tipoDevolucion: 'otro',
    });
    (prisma.assetCategory.update as jest.Mock).mockImplementation(({ data }) =>
      Promise.resolve({ id: 'category-1', ...data })
    );

    const response = await PUT(
      new NextRequest('http://localhost/api/categorias/category-1', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tipoDevolucion: 'notebook' }),
      }),
      { params: Promise.resolve({ id: 'category-1' }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ tipoDevolucion: 'notebook' });
  });

  test('expone tipoDevolucion en el listado de categorías', async () => {
    (prisma.assetCategory.findMany as jest.Mock).mockResolvedValue([
      { id: 'category-1', nombre: 'Laptop', tipoDevolucion: 'notebook' },
    ]);

    const response = await GET(new NextRequest('http://localhost/api/categorias'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: 'category-1', nombre: 'Laptop', tipoDevolucion: 'notebook' },
    ]);
  });
});
