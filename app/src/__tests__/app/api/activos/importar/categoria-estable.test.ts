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
    },
    assetHistory: { create: jest.fn() },
    employee: { findUnique: jest.fn(), create: jest.fn() },
    assignment: { create: jest.fn() },
    maintenance: { create: jest.fn() },
  },
}));

jest.mock('xlsx', () => ({
  read: jest.fn().mockReturnValue({ Sheets: { Hoja1: {} } }),
  utils: { sheet_to_json: jest.fn() },
}));

jest.mock('@/lib/logger', () => ({ logger: { log: jest.fn(), error: jest.fn() } }));

import { POST } from '@/app/api/activos/importar/route';
import { requirePermission } from '@/lib/auth/guard';
import { prisma } from '@/lib/prisma';
import * as XLSX from 'xlsx';
import type { NextRequest } from 'next/server';

const mockRequirePermission = requirePermission as jest.Mock;
const mockAssetCategoryFindUnique = prisma.assetCategory.findUnique as jest.Mock;
const mockAssetCategoryCreate = prisma.assetCategory.create as jest.Mock;
const mockAssetFindMany = prisma.asset.findMany as jest.Mock;
const mockAssetCreate = prisma.asset.create as jest.Mock;
const mockAssetHistoryCreate = prisma.assetHistory.create as jest.Mock;
const mockSheetToJson = XLSX.utils.sheet_to_json as jest.Mock;

const rows = [
  ['Marca', 'Modelo', 'Serie', 'Procesador', 'IMEI', 'Pulgadas'],
  ['Lenovo', 'T14', 'SN-001', 'Intel Core Ultra', '123456789012345', '27'],
];

function requestFor(categoriaId: string): NextRequest {
  const values = new Map<string, unknown>([
    [
      'file',
      {
        name: 'activos.xlsx',
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        size: 128,
        arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),
      },
    ],
    ['sheetName', 'Hoja1'],
    ['categoriaId', categoriaId],
    [
      'mapping',
      JSON.stringify({
        marca: 'Marca',
        modelo: 'Modelo',
        numeroSerie: 'Serie',
        procesador: 'Procesador',
        imei: 'IMEI',
        pulgadas: 'Pulgadas',
      }),
    ],
  ]);

  return {
    formData: jest.fn().mockResolvedValue({ get: (key: string) => values.get(key) ?? null }),
  } as unknown as NextRequest;
}

describe('POST /api/activos/importar — categoría estable', () => {
  beforeEach(() => {
    mockRequirePermission.mockResolvedValue({ user: { email: 'ti@example.com' } });
    mockAssetCategoryCreate.mockResolvedValue({ id: 'created-category' });
    mockAssetFindMany.mockResolvedValue([]);
    mockAssetCreate.mockImplementation(({ data }) => Promise.resolve({ id: 'asset-1', ...data }));
    mockAssetHistoryCreate.mockResolvedValue({});
    mockSheetToJson.mockReturnValue(rows);
  });

  test('importa Laptop como notebook por categoriaId y conserva solo sus campos especiales', async () => {
    mockAssetCategoryFindUnique.mockResolvedValue({
      id: 'cat-laptop',
      nombre: 'Laptop',
      tipoDevolucion: 'notebook',
    });

    const response = await POST(requestFor('cat-laptop'));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ imported: 1, skipped: 0 });
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

  test('no trata como notebook una categoría llamada Notebook cuyo tipo es otro', async () => {
    mockAssetCategoryFindUnique.mockResolvedValue({
      id: 'cat-otro',
      nombre: 'Notebook',
      tipoDevolucion: 'otro',
    });

    const response = await POST(requestFor('cat-otro'));

    expect(response.status).toBe(200);
    expect(mockAssetCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          categoriaId: 'cat-otro',
          procesador: null,
          imei: null,
          pulgadas: null,
        }),
      })
    );
  });

  test('rechaza una categoriaId desconocida sin crear una categoría implícita', async () => {
    mockAssetCategoryFindUnique.mockResolvedValue(null);

    const response = await POST(requestFor('cat-desconocida'));

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Categoría no encontrada' });
    expect(mockAssetCategoryCreate).not.toHaveBeenCalled();
  });
});
