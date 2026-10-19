/**
 * @jest-environment node
 */
// Repartir una compra (SPEC 2.111.3): a la sede de llegada o con un despacho.
jest.mock('@/shared/prisma', () => ({
  prisma: {
    purchase: { findUnique: jest.fn() },
    sede: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

import { prisma } from '@/shared/prisma';
import { repartirCompra } from '@/modules/compras/servicio';

const STGO = '11111111-1111-4111-8111-111111111111';
const CONCE = '22222222-2222-4222-8222-222222222222';
const quien = { emisor: 'Admin', usuario: 'admin@x' };

const compra = (estadoEquipo = 'por_repartir', porRepartir = 10) => ({
  id: 'c1',
  sedeId: STGO,
  numeroFactura: 'F-1',
  sede: { id: STGO, nombre: 'Santiago' },
  purchaseAssets: [
    {
      assetId: 'a1',
      llegoConCompra: true,
      asset: { id: 'a1', estado: estadoEquipo, sedeId: STGO, deletedAt: null, marca: 'Dell', modelo: 'X' },
    },
  ],
  purchaseKitItems: [
    {
      id: 'l1',
      itemId: 'k-stgo',
      cantidad: 10,
      cantidadPorRepartir: porRepartir,
      item: { nombre: 'Casco', categoria: 'epp', stockMinimo: 5 },
    },
  ],
});

let tx: Record<string, Record<string, jest.Mock>>;
beforeEach(() => {
  tx = {
    asset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    assetHistory: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    purchaseKitItem: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    purchaseKitReparto: { create: jest.fn() },
    welcomeKitItem: { update: jest.fn().mockResolvedValue({ cantidad: 13 }) },
    dispatchGuide: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'g1', numero: 'GD-2026-00001' }),
    },
  };
  (prisma.$transaction as jest.Mock).mockReset().mockImplementation((fn) => fn(tx));
  (prisma.purchase.findUnique as jest.Mock).mockReset();
  (prisma.sede.findUnique as jest.Mock).mockReset().mockResolvedValue({ id: CONCE, nombre: 'Concepción' });
});

const envio = {
  otChilexpress: '123',
  fechaDespacho: '2026-09-25T15:00:00.000Z',
  receptorNombre: 'Ana',
  receptorRut: '76.123.456-0',
};

describe('repartir a la sede de llegada', () => {
  test('el equipo queda Disponible y el Kit/EPP suma al stock, sin despacho', async () => {
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValue(compra());
    const r = await repartirCompra(
      'c1',
      { sedeDestinoId: STGO, equipos: ['a1'], kit: [{ lineaId: 'l1', cantidad: 3 }] },
      quien
    );
    expect(r.despacho).toBeNull();
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', estado: 'por_repartir', deletedAt: null },
      data: { estado: 'disponible' },
    });
    expect(tx.welcomeKitItem.update).toHaveBeenCalledWith({
      where: { id: 'k-stgo' },
      data: { cantidad: { increment: 3 } },
    });
    expect(tx.purchaseKitItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'l1', cantidadPorRepartir: { gte: 3 } },
      data: { cantidadPorRepartir: { decrement: 3 } },
    });
    expect(tx.purchaseKitReparto.create).toHaveBeenCalledWith({
      data: { purchaseKitItemId: 'l1', sedeId: STGO, cantidad: 3, repartidoPor: 'admin@x' },
    });
    expect(tx.dispatchGuide.create).not.toHaveBeenCalled();
  });
});

describe('repartir a otra sede', () => {
  test('crea el despacho vinculado a la compra, con equipos y Kit/EPP; el stock no se toca', async () => {
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValue(compra());
    const r = await repartirCompra(
      'c1',
      { sedeDestinoId: CONCE, equipos: ['a1'], kit: [{ lineaId: 'l1', cantidad: 4 }], envio },
      quien
    );
    expect(r.despacho).toEqual({ id: 'g1', numero: 'GD-2026-00001' });
    expect(tx.dispatchGuide.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sedeId: STGO,
          sedeDestinoId: CONCE,
          purchaseId: 'c1',
          estado: 'en_transito',
          items: { create: [{ assetId: 'a1' }] },
          kitItems: { create: [{ itemId: 'k-stgo', cantidad: 4 }] },
        }),
      })
    );
    // Sale de "Por repartir" a "En transito".
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'a1', estado: 'por_repartir', deletedAt: null },
      data: { estado: 'en_transito' },
    });
    expect(tx.purchaseKitReparto.create).toHaveBeenCalledWith({
      data: { purchaseKitItemId: 'l1', sedeId: CONCE, cantidad: 4, guideId: 'g1', repartidoPor: 'admin@x' },
    });
    expect(tx.welcomeKitItem.update).not.toHaveBeenCalled();
  });

  test('sin datos del despacho: error por campo, con las reglas de Despachos', async () => {
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValue(compra());
    await expect(
      repartirCompra('c1', { sedeDestinoId: CONCE, equipos: ['a1'], kit: [] }, quien)
    ).rejects.toMatchObject({
      status: 400,
      details: expect.arrayContaining([expect.objectContaining({ field: 'otChilexpress' })]),
    });
    expect(tx.dispatchGuide.create).not.toHaveBeenCalled();
  });

  test('una sede destino que no existe se rechaza', async () => {
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValue(compra());
    (prisma.sede.findUnique as jest.Mock).mockResolvedValue(null);
    await expect(
      repartirCompra('c1', { sedeDestinoId: CONCE, equipos: ['a1'], kit: [], envio }, quien)
    ).rejects.toThrow(/no existe/);
  });
});

describe('límites del reparto', () => {
  test('no se reparte más Kit/EPP del que queda', async () => {
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValue(compra('por_repartir', 2));
    await expect(
      repartirCompra('c1', { sedeDestinoId: STGO, equipos: [], kit: [{ lineaId: 'l1', cantidad: 3 }] }, quien)
    ).rejects.toThrow(/quedan 2 por repartir/);
  });

  test('un equipo ya repartido no se reparte de nuevo', async () => {
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValue(compra('disponible'));
    await expect(
      repartirCompra('c1', { sedeDestinoId: STGO, equipos: ['a1'], kit: [] }, quien)
    ).rejects.toThrow(/ya se repartió/);
  });

  test('si otro reparto se adelantó (ya no alcanza lo pendiente), se cancela todo', async () => {
    (prisma.purchase.findUnique as jest.Mock).mockResolvedValue(compra());
    tx.purchaseKitItem.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      repartirCompra('c1', { sedeDestinoId: STGO, equipos: [], kit: [{ lineaId: 'l1', cantidad: 3 }] }, quien)
    ).rejects.toThrow(/Otro reparto/);
  });
});
