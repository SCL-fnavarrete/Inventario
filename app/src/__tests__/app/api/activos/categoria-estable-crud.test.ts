/**
 * @jest-environment node
 */

jest.mock('@/lib/auth/guard', () => ({
  requirePermission: jest.fn().mockResolvedValue({ user: { email: 'ti@example.com' } }),
  handleApiError: jest.requireActual('@/lib/auth/guard').handleApiError,
}));

jest.mock('@/lib/prisma', () => ({
  prisma: {
    assetCategory: { findUnique: jest.fn() },
    asset: { findUnique: jest.fn(), create: jest.fn() },
    assignment: { findFirst: jest.fn() },
    maintenance: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/lib/services/assetHistoryService', () => ({
  assetHistoryService: {
    registrarCreacion: jest.fn(),
    registrarCambioEstado: jest.fn(),
    registrarActualizacionSpecs: jest.fn(),
  },
}));

import { POST } from '@/app/api/activos/route';
import { PUT } from '@/app/api/activos/[id]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest } from 'next/server';

const laptopCategoryId = 'c0a80101-0000-4000-8000-000000000001';
const cellularCategoryId = 'c0a80101-0000-4000-8000-000000000003';
const otherCategoryId = 'c0a80101-0000-4000-8000-000000000002';
const assetId = 'c0a80101-0000-4000-8000-000000000010';

const laptopCategory = {
  id: laptopCategoryId,
  nombre: 'Laptop',
  tipoDevolucion: 'notebook',
};

const notebookNamedOtherCategory = {
  id: otherCategoryId,
  nombre: 'Notebook',
  tipoDevolucion: 'otro',
};

const cellularCategory = {
  id: cellularCategoryId,
  nombre: 'Teléfono corporativo',
  tipoDevolucion: 'celular',
};

function createRequest(categoriaId: string) {
  return new NextRequest('http://localhost/api/activos', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      categoriaId,
      marca: 'Lenovo',
      modelo: 'T14',
      procesador: 'Intel Core Ultra',
      ram: '32 GB',
      discoDuro: '1 TB',
      sistemaOperativo: 'Windows 11',
      microsoft365: true,
      antivirus: 'Defender',
      nombreEquipo: 'NB-SCL-001',
      imei: '123456789012345',
      numeroTelefono: '+56912345678',
      numeroActivacion: 'SIM-001',
      tipoPlan: 'Empresa',
      operador: 'Entel',
      tieneCargador: true,
      pulgadas: 27,
    }),
  });
}

function configureAssetUpdate(existingAsset: Record<string, unknown>) {
  (prisma.asset.findUnique as jest.Mock).mockResolvedValue(existingAsset);
  (prisma.$transaction as jest.Mock).mockImplementation(async (callback) =>
    callback({
      asset: {
        update: jest.fn().mockImplementation(async ({ data }) => ({ ...existingAsset, ...data })),
      },
    })
  );
}

describe('API activos — whitelist por tipoDevolucion', () => {
  beforeEach(() => {
    (prisma.asset.create as jest.Mock).mockImplementation(async ({ data }) => ({
      id: assetId,
      ...data,
    }));
  });

  test('POST conserva campos notebook de Laptop y limpia la inyección celular/monitor', async () => {
    (prisma.assetCategory.findUnique as jest.Mock).mockResolvedValue(laptopCategory);

    const response = await POST(createRequest(laptopCategoryId));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      procesador: 'Intel Core Ultra',
      ram: '32 GB',
      discoDuro: '1 TB',
      sistemaOperativo: 'Windows 11',
      microsoft365: true,
      antivirus: 'Defender',
      nombreEquipo: 'NB-SCL-001',
      imei: null,
      numeroTelefono: null,
      numeroActivacion: null,
      tipoPlan: null,
      operador: null,
      tieneCargador: false,
      pulgadas: null,
    });
  });

  test('POST limpia todos los campos especiales si Notebook tiene tipo otro', async () => {
    (prisma.assetCategory.findUnique as jest.Mock).mockResolvedValue(
      notebookNamedOtherCategory
    );

    const response = await POST(createRequest(otherCategoryId));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      procesador: null,
      ram: null,
      discoDuro: null,
      sistemaOperativo: null,
      microsoft365: false,
      antivirus: null,
      nombreEquipo: null,
      imei: null,
      numeroTelefono: null,
      numeroActivacion: null,
      tipoPlan: null,
      operador: null,
      tieneCargador: false,
      pulgadas: null,
    });
  });

  test('POST conserva todos los campos celular y limpia notebook/monitor según el enum', async () => {
    (prisma.assetCategory.findUnique as jest.Mock).mockResolvedValue(cellularCategory);

    const response = await POST(createRequest(cellularCategoryId));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      imei: '123456789012345',
      numeroTelefono: '+56912345678',
      numeroActivacion: 'SIM-001',
      tipoPlan: 'Empresa',
      operador: 'Entel',
      tieneCargador: true,
      procesador: null,
      ram: null,
      discoDuro: null,
      sistemaOperativo: null,
      microsoft365: false,
      antivirus: null,
      nombreEquipo: null,
      pulgadas: null,
    });
  });

  test('PUT usa la categoría actual Laptop si no recibe categoriaId y limpia una inyección celular', async () => {
    configureAssetUpdate({
      id: assetId,
      categoriaId: laptopCategoryId,
      categoria: laptopCategory,
      estado: 'disponible',
      procesador: null,
      ram: null,
      discoDuro: null,
      sistemaOperativo: null,
      microsoft365: false,
      imei: null,
      numeroTelefono: null,
      pulgadas: null,
    });
    (prisma.assetCategory.findUnique as jest.Mock).mockResolvedValue(laptopCategory);

    const response = await PUT(
      new NextRequest(`http://localhost/api/activos/${assetId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          procesador: 'Intel Core Ultra',
          imei: '123456789012345',
          numeroTelefono: '+56912345678',
          pulgadas: 27,
          microsoft365: true,
        }),
      }),
      { params: Promise.resolve({ id: assetId }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      procesador: 'Intel Core Ultra',
      microsoft365: true,
      imei: null,
      numeroTelefono: null,
      pulgadas: null,
    });
  });

  test('PUT limpia campos celular existentes al cambiar a una categoría de tipo otro y los audita', async () => {
    configureAssetUpdate({
      id: assetId,
      categoriaId: cellularCategoryId,
      categoria: cellularCategory,
      estado: 'disponible',
      procesador: 'Intel Core Ultra',
      ram: '32 GB',
      discoDuro: '1 TB',
      sistemaOperativo: 'Windows 11',
      microsoft365: true,
      antivirus: 'Defender',
      nombreEquipo: 'NB-SCL-001',
      imei: '123456789012345',
      numeroTelefono: '+56912345678',
      numeroActivacion: 'SIM-001',
      tipoPlan: 'Empresa',
      operador: 'Entel',
      tieneCargador: true,
      pulgadas: 27,
    });
    (prisma.assetCategory.findUnique as jest.Mock).mockResolvedValue(
      notebookNamedOtherCategory
    );

    const response = await PUT(
      new NextRequest(`http://localhost/api/activos/${assetId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoriaId: otherCategoryId }),
      }),
      { params: Promise.resolve({ id: assetId }) }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      categoriaId: otherCategoryId,
      procesador: null,
      ram: null,
      discoDuro: null,
      sistemaOperativo: null,
      microsoft365: false,
      antivirus: null,
      nombreEquipo: null,
      imei: null,
      numeroTelefono: null,
      numeroActivacion: null,
      tipoPlan: null,
      operador: null,
      tieneCargador: false,
      pulgadas: null,
    });

    const { assetHistoryService } = jest.requireMock('@/lib/services/assetHistoryService');
    expect(assetHistoryService.registrarActualizacionSpecs).toHaveBeenCalledWith(
      assetId,
      expect.objectContaining({
        categoriaId: cellularCategoryId,
        procesador: 'Intel Core Ultra',
        ram: '32 GB',
        discoDuro: '1 TB',
        sistemaOperativo: 'Windows 11',
        microsoft365: true,
        antivirus: 'Defender',
        nombreEquipo: 'NB-SCL-001',
        imei: '123456789012345',
        numeroTelefono: '+56912345678',
        numeroActivacion: 'SIM-001',
        tipoPlan: 'Empresa',
        operador: 'Entel',
        tieneCargador: true,
        pulgadas: 27,
      }),
      expect.objectContaining({
        categoriaId: otherCategoryId,
        procesador: null,
        ram: null,
        discoDuro: null,
        sistemaOperativo: null,
        microsoft365: false,
        antivirus: null,
        nombreEquipo: null,
        imei: null,
        numeroTelefono: null,
        numeroActivacion: null,
        tipoPlan: null,
        operador: null,
        tieneCargador: false,
        pulgadas: null,
      }),
      'ti@example.com',
      expect.anything()
    );
  });

  test('PUT rechaza la categoría efectiva inexistente', async () => {
    configureAssetUpdate({
      id: assetId,
      categoriaId: laptopCategoryId,
      categoria: laptopCategory,
      estado: 'disponible',
    });
    (prisma.assetCategory.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await PUT(
      new NextRequest(`http://localhost/api/activos/${assetId}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ categoriaId: otherCategoryId }),
      }),
      { params: Promise.resolve({ id: assetId }) }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Categoría no encontrada' });
  });
});
