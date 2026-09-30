/**
 * @jest-environment node
 */
// Editar y eliminar un equipo (PUT y DELETE /api/activos/[id]), ahora en el
// servicio de Activos (SPEC 2.118).
const mockDb = {
  asset: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  assetCategory: { findUnique: jest.fn() },
  assetHistory: { create: jest.fn() },
  $transaction: jest.fn(),
};
jest.mock('@/shared/prisma', () => ({
  get prisma() {
    return mockDb;
  },
}));

import { editarActivo, eliminarActivo } from '@/modules/activos/servicio';

const activo = {
  id: 'a1',
  estado: 'disponible',
  categoriaId: 'c1',
  numeroSerie: 'S1',
  imei: null,
  fechaCompra: null,
  fechaGarantiaFin: null,
  procesador: 'i5',
  ram: null,
  discoDuro: null,
  sistemaOperativo: null,
  pulgadas: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.assetCategory.findUnique.mockResolvedValue({ tipoFicha: 'computador' });
  mockDb.asset.update.mockImplementation(({ data }: { data: object }) => ({ ...activo, ...data }));
  mockDb.$transaction.mockImplementation((fn: (tx: typeof mockDb) => unknown) => fn(mockDb));
});

describe('editarActivo: valor (SPEC 2.124)', () => {
  test('un cambio de valor se guarda y queda en el historial con antes y después', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce({ ...activo, valor: 850000 });
    const r = await editarActivo('a1', { valor: 600000 }, 'jsoto');
    expect(r).toMatchObject({ valor: 600000 });
    expect(mockDb.assetHistory.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        descripcion: 'Valor: $850.000 → $600.000',
        datosAnteriores: { valor: 850000 },
        datosNuevos: { valor: 600000 },
        usuarioSistema: 'jsoto',
      }),
    });
  });

  test('el mismo valor, o no enviarlo, no anota nada', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce({ ...activo, valor: 850000 });
    await editarActivo('a1', { valor: 850000 }, 'yo');
    mockDb.asset.findUnique.mockResolvedValueOnce({ ...activo, valor: 850000 });
    const r = await editarActivo('a1', { marca: 'HP' }, 'yo');
    expect(mockDb.assetHistory.create).not.toHaveBeenCalled();
    expect(mockDb.asset.update.mock.calls[1][0].data).not.toHaveProperty('valor');
    expect(r).toMatchObject({ marca: 'HP' });
  });

  test('quitar el valor también queda en el historial', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce({ ...activo, valor: 850000 });
    await editarActivo('a1', { valor: null }, 'yo');
    expect(mockDb.assetHistory.create.mock.calls[0][0].data.descripcion).toBe('Valor: $850.000 → —');
  });
});

describe('editarActivo', () => {
  test('guarda los cambios y anota en el historial los de especificaciones', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce(activo);
    const r = await editarActivo('a1', { procesador: 'i7', marca: 'HP' }, 'yo@test.cl');
    expect(r).toMatchObject({ procesador: 'i7', marca: 'HP' });
    expect(mockDb.assetHistory.create).toHaveBeenCalledTimes(1);
  });

  test('pulgadas se compara como número: 14 igual al decimal 14 no anota historial', async () => {
    const { Prisma } = jest.requireActual('@prisma/client');
    mockDb.asset.findUnique.mockResolvedValueOnce({ ...activo, pulgadas: new Prisma.Decimal(14) });
    await editarActivo('a1', { pulgadas: 14 }, 'yo');
    expect(mockDb.assetHistory.create).not.toHaveBeenCalled();

    mockDb.asset.findUnique.mockResolvedValueOnce({ ...activo, pulgadas: new Prisma.Decimal(14) });
    await editarActivo('a1', { pulgadas: 15.6 }, 'yo');
    expect(mockDb.assetHistory.create).toHaveBeenCalledTimes(1);
  });

  test('el estado no se edita (SPEC 2.86): 409 y no escribe', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce(activo);
    await expect(editarActivo('a1', { estado: 'baja' }, 'yo')).rejects.toMatchObject({
      status: 409,
    });
    expect(mockDb.asset.update).not.toHaveBeenCalled();
  });

  test('un N° de serie que ya tiene otro equipo: 409 marcando el campo', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce(activo).mockResolvedValueOnce({ id: 'otro' });
    await expect(editarActivo('a1', { numeroSerie: 'S2' }, 'yo')).rejects.toMatchObject({
      status: 409,
      details: [{ field: 'numeroSerie' }],
    });
  });

  test('un equipo que no existe: 404', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce(null);
    await expect(editarActivo('x', {}, 'yo')).rejects.toMatchObject({ status: 404 });
  });
});

describe('eliminarActivo', () => {
  const sinMovimientos = { ...activo, deletedAt: null, _count: { history: 0, assignments: 0 } };

  test('sin historial ni asignaciones se borra de verdad', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce(sinMovimientos);
    await expect(eliminarActivo('a1', { descartar: false }, 'yo')).resolves.toEqual({
      descartado: false,
    });
    expect(mockDb.asset.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  test('con historial no se borra: 409 y apunta a la baja', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce({
      ...sinMovimientos,
      _count: { history: 2, assignments: 0 },
    });
    await expect(eliminarActivo('a1', { descartar: false }, 'yo')).rejects.toMatchObject({
      status: 409,
    });
    expect(mockDb.asset.delete).not.toHaveBeenCalled();
  });

  test('un equipo asignado no se borra ni se descarta', async () => {
    mockDb.asset.findUnique.mockResolvedValueOnce({ ...sinMovimientos, estado: 'asignado' });
    await expect(
      eliminarActivo('a1', { descartar: true, motivo: 'dup' }, 'yo')
    ).rejects.toMatchObject({
      status: 409,
    });
  });

  test('descartar pide motivo; con motivo marca deletedAt y deja historial', async () => {
    mockDb.asset.findUnique.mockResolvedValue({
      ...sinMovimientos,
      _count: { history: 3, assignments: 1 },
    });
    await expect(eliminarActivo('a1', { descartar: true }, 'yo')).rejects.toMatchObject({
      status: 400,
    });
    const r = await eliminarActivo('a1', { descartar: true, motivo: 'Duplicado' }, 'yo');
    expect(r.descartado).toBe(true);
    expect(mockDb.asset.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { deletedAt: expect.any(Date) },
    });
    expect(mockDb.assetHistory.create).toHaveBeenCalledTimes(1);
    expect(mockDb.asset.delete).not.toHaveBeenCalled();
  });
});
