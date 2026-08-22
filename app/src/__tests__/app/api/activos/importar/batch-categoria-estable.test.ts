/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn(),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    assetCategory: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    asset: {
      findMany: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    assetHistory: { create: jest.fn() },
    employee: { findUnique: jest.fn(), create: jest.fn() },
    assignment: { create: jest.fn() },
  },
}));

import { POST } from '@/app/api/activos/importar/batch/route';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import type { NextRequest } from 'next/server';

const mockRequirePermission = requirePermission as jest.Mock;
const mockAssetCategoryFindUnique = prisma.assetCategory.findUnique as jest.Mock;
const mockAssetCategoryCreate = prisma.assetCategory.create as jest.Mock;
const mockAssetFindMany = prisma.asset.findMany as jest.Mock;
const mockAssetCreate = prisma.asset.create as jest.Mock;
const mockAssetHistoryCreate = prisma.assetHistory.create as jest.Mock;

const row = {
  rowIndex: 0,
  data: {
    marca: 'Lenovo',
    modelo: 'T14',
    numeroSerie: 'SN-001',
    procesador: 'Intel Core Ultra',
    imei: '123456789012345',
    pulgadas: '27',
  },
};

function requestFor(categoriaId: string): NextRequest {
  return {
    json: jest.fn().mockResolvedValue({ categoriaId, rows: [row] }),
  } as unknown as NextRequest;
}

describe('POST /api/activos/importar/batch — categoría estable', () => {
  beforeEach(() => {
    mockRequirePermission.mockResolvedValue({ user: { email: 'ti@example.com' } });
    mockAssetCategoryCreate.mockResolvedValue({ id: 'created-category' });
    mockAssetFindMany.mockResolvedValue([]);
    mockAssetCreate.mockImplementation(({ data }) => Promise.resolve({ id: 'asset-1', ...data }));
    mockAssetHistoryCreate.mockResolvedValue({});
  });

  test('reimporta Laptop como notebook por categoriaId y filtra IMEI/pulgadas', async () => {
    mockAssetCategoryFindUnique.mockResolvedValue({
      id: 'cat-laptop',
      nombre: 'Laptop',
      tipoDevolucion: 'notebook',
    });

    const response = await POST(requestFor('cat-laptop'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ imported: 1, failed: 0 });
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoriaId: 'cat-laptop',
          procesador: 'Intel Core Ultra',
          imei: null,
          pulgadas: null,
        }),
      })
    );
  });

  test('no usa el nombre Notebook para campos especiales si el tipo es otro', async () => {
    mockAssetCategoryFindUnique.mockResolvedValue({
      id: 'cat-otro',
      nombre: 'Notebook',
      tipoDevolucion: 'otro',
    });

    const response = await POST(requestFor('cat-otro'));

    expect(response.status).toBe(200);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ procesador: null, imei: null, pulgadas: null }),
      })
    );
  });

  test('rechaza categoriaId desconocida y no crea categorías al corregir filas', async () => {
    mockAssetCategoryFindUnique.mockResolvedValue(null);

    const response = await POST(requestFor('cat-desconocida'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Categoría no encontrada' });
    expect(mockAssetCategoryCreate).not.toHaveBeenCalled();
  });
});
