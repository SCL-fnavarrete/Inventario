// Compras: primero se compra, despues se reparte (SPEC 2.111).
jest.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  agregarEquiposNuevos,
  agregarLineasKit,
  avanceReparto,
  exigirSinReparto,
  quitarEquipo,
} from '@/lib/services/compraService';
import { createPurchaseWithAssetsSchema } from '@/lib/validations/purchase';

const equipo = (estado: string, llegoConCompra = true, deletedAt: Date | null = null) => ({
  llegoConCompra,
  asset: { estado, deletedAt },
});
const kit = (cantidad: number, cantidadPorRepartir: number) => ({ cantidad, cantidadPorRepartir });

describe('avanceReparto', () => {
  test('recién comprada: todo por repartir', () => {
    const a = avanceReparto({ purchaseAssets: [equipo('por_repartir')], purchaseKitItems: [kit(10, 10)] });
    expect(a).toEqual({ pendiente: 11, repartido: 0, estado: 'por_repartir' });
  });

  test('repartida en parte', () => {
    const a = avanceReparto({
      purchaseAssets: [equipo('por_repartir'), equipo('en_transito')],
      purchaseKitItems: [kit(10, 4)],
    });
    expect(a).toEqual({ pendiente: 5, repartido: 7, estado: 'repartida_en_parte' });
  });

  test('todo repartido', () => {
    const a = avanceReparto({ purchaseAssets: [equipo('disponible')], purchaseKitItems: [kit(3, 0)] });
    expect(a.estado).toBe('repartida');
  });

  test('un equipo que ya existía y solo se vinculó no cuenta para el reparto', () => {
    const a = avanceReparto({ purchaseAssets: [equipo('disponible', false)], purchaseKitItems: [] });
    expect(a).toEqual({ pendiente: 0, repartido: 0, estado: null });
  });

  test('un equipo descartado (quitado antes de repartir) no cuenta', () => {
    const a = avanceReparto({
      purchaseAssets: [equipo('por_repartir', true, new Date())],
      purchaseKitItems: [],
    });
    expect(a.estado).toBeNull();
  });

  test('compras anteriores a 2.111 (Kit/EPP en 0 por repartir) quedan repartidas', () => {
    expect(avanceReparto({ purchaseAssets: [], purchaseKitItems: [kit(5, 0)] }).estado).toBe('repartida');
  });
});

describe('exigirSinReparto', () => {
  test('sin nada repartido deja eliminar o cambiar la sede', () => {
    expect(() =>
      exigirSinReparto({ purchaseAssets: [equipo('por_repartir')], purchaseKitItems: [kit(2, 2)] }, 'eliminar la compra')
    ).not.toThrow();
  });

  test('con algo repartido lo rechaza (409)', () => {
    expect(() =>
      exigirSinReparto({ purchaseAssets: [equipo('disponible')], purchaseKitItems: [] }, 'eliminar la compra')
    ).toThrow(/No se puede eliminar la compra: ya se repartió/);
  });
});

// Transaccion simulada
const nuevaTx = () => ({
  asset: {
    findUnique: jest.fn().mockResolvedValue(null),
    create: jest.fn(({ data }) => Promise.resolve({ id: `a-${data.numeroSerie}`, ...data })),
    update: jest.fn(),
  },
  assetHistory: { create: jest.fn() },
  purchaseAsset: { create: jest.fn(), delete: jest.fn() },
  purchaseKitItem: { create: jest.fn() },
  welcomeKitItem: { findMany: jest.fn() },
});
const compra = { id: 'c1', sedeId: 'stgo', numeroFactura: 'F-1', fechaFactura: new Date('2026-09-20T00:00:00Z') };

describe('agregarEquiposNuevos', () => {
  test('nacen "Por repartir" en la sede de llegada, con la fecha de la factura', async () => {
    const tx = nuevaTx();
    await agregarEquiposNuevos(
      tx as never,
      compra,
      [{ categoriaId: 'cat', marca: 'Dell', modelo: 'X', numeroSerie: 'S1', condicion: 'nuevo' }],
      'admin@x'
    );
    expect(tx.asset.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ estado: 'por_repartir', sedeId: 'stgo', fechaCompra: compra.fechaFactura }),
    });
    expect(tx.purchaseAsset.create).toHaveBeenCalledWith({
      data: { purchaseId: 'c1', assetId: 'a-S1', llegoConCompra: true },
    });
  });

  test('un N° de serie que ya existe corta todo con el campo marcado', async () => {
    const tx = nuevaTx();
    tx.asset.findUnique.mockResolvedValue({ id: 'otro' });
    await expect(
      agregarEquiposNuevos(
        tx as never,
        compra,
        [{ categoriaId: 'cat', marca: 'Dell', modelo: 'X', numeroSerie: 'S1', condicion: 'nuevo' }],
        'admin@x'
      )
    ).rejects.toThrow(/Ya existe un activo con el número de serie S1/);
    expect(tx.asset.create).not.toHaveBeenCalled();
  });
});

describe('agregarLineasKit', () => {
  test('queda todo por repartir, sin tocar el stock', async () => {
    const tx = nuevaTx();
    tx.welcomeKitItem.findMany.mockResolvedValue([{ id: 'k1', sedeId: 'stgo' }]);
    await agregarLineasKit(tx as never, compra, [{ itemId: 'k1', cantidad: 10 }]);
    expect(tx.purchaseKitItem.create).toHaveBeenCalledWith({
      data: { purchaseId: 'c1', itemId: 'k1', cantidad: 10, cantidadPorRepartir: 10 },
    });
  });

  test('el artículo debe ser del catálogo de la sede de llegada', async () => {
    const tx = nuevaTx();
    tx.welcomeKitItem.findMany.mockResolvedValue([{ id: 'k1', sedeId: 'conce' }]);
    await expect(agregarLineasKit(tx as never, compra, [{ itemId: 'k1', cantidad: 1 }])).rejects.toThrow(
      /catálogo de la sede de llegada/
    );
  });
});

describe('quitarEquipo', () => {
  const vinculo = (estado: string, llegoConCompra = true) => ({ id: 'pa1', assetId: 'a1', llegoConCompra, asset: { estado } });

  test('comprado y por repartir: se descarta (queda en el historial) y se quita', async () => {
    const tx = nuevaTx();
    await quitarEquipo(tx as never, compra, vinculo('por_repartir'), 'admin@x');
    expect(tx.asset.update).toHaveBeenCalledWith({ where: { id: 'a1' }, data: { deletedAt: expect.any(Date) } });
    expect(tx.assetHistory.create).toHaveBeenCalled();
    expect(tx.purchaseAsset.delete).toHaveBeenCalledWith({ where: { id: 'pa1' } });
  });

  test('comprado y ya repartido: no se quita', async () => {
    const tx = nuevaTx();
    await expect(quitarEquipo(tx as never, compra, vinculo('disponible'), 'admin@x')).rejects.toThrow(/ya se repartió/);
    expect(tx.purchaseAsset.delete).not.toHaveBeenCalled();
  });

  test('solo vinculado (ya existía): se desvincula sin descartarlo', async () => {
    const tx = nuevaTx();
    await quitarEquipo(tx as never, compra, vinculo('asignado', false), 'admin@x');
    expect(tx.asset.update).not.toHaveBeenCalled();
    expect(tx.purchaseAsset.delete).toHaveBeenCalled();
  });
});

describe('createPurchaseWithAssetsSchema', () => {
  const base = { sedeId: '11111111-1111-4111-8111-111111111111', numeroFactura: 'F-1', fechaFactura: '2026-09-20' };
  const eq = (numeroSerie: string) => ({
    categoriaId: '22222222-2222-4222-8222-222222222222',
    marca: 'Dell',
    modelo: 'X',
    numeroSerie,
  });

  test('exige la sede de llegada', () => {
    const r = createPurchaseWithAssetsSchema.safeParse({ ...base, sedeId: undefined, equiposNuevos: [eq('S1')] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('Elige la sede de llegada');
  });

  test('exige al menos un equipo o artículo', () => {
    const r = createPurchaseWithAssetsSchema.safeParse(base);
    expect(r.error?.issues.map((i) => i.path[0])).toContain('lineas');
  });

  test('no acepta el mismo N° de serie dos veces en la lista', () => {
    const r = createPurchaseWithAssetsSchema.safeParse({ ...base, equiposNuevos: [eq('S1'), eq('s1')] });
    expect(r.error?.issues[0].message).toMatch(/dos veces/);
  });

  test('una compra con equipos nuevos es válida', () => {
    expect(createPurchaseWithAssetsSchema.safeParse({ ...base, equiposNuevos: [eq('S1')] }).success).toBe(true);
  });
});
