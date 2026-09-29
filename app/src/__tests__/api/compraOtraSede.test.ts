/** @jest-environment node */
// SPEC 2.111.6 (decision del 28-sep-2026): Compras muestra los equipos
// comprados y a que sede se repartieron, no a quien estan asignados. Ni a
// admin ni a tecnico.
jest.mock('@/shared/prisma', () => ({
  prisma: {
    purchase: { findUnique: jest.fn() },
    purchaseAsset: { findMany: jest.fn() },
  },
}));
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/modules/compras/servicio', () => ({
  ...jest.requireActual('@/modules/compras/servicio'),
  avanceReparto: jest.fn(() => ({})),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/shared/prisma';
import { requirePermission } from '@/shared/auth/guard';
import { GET as detalleCompra } from '@/app/api/compras/[id]/route';
import { GET as equiposCompra } from '@/app/api/compras/[id]/activos/route';

const equipo = (id: string, sedeId: string) => ({
  asset: { id, sedeId, deletedAt: null, empleadoActualId: 'e1', sede: { id: sedeId, nombre: sedeId } },
});
const ctx = { params: Promise.resolve({ id: 'c1' }) };
const SESIONES = {
  tecnico: { user: { id: 'u', role: 'tecnico', sedeId: 's1' } },
  admin: { user: { id: 'u', role: 'admin', sedeId: null } },
};

beforeEach(() => {
  (prisma.purchase.findUnique as jest.Mock).mockResolvedValue({
    id: 'c1',
    purchaseAssets: [equipo('a1', 's1'), equipo('a2', 's2')],
    purchaseKitItems: [],
  });
  (prisma.purchaseAsset.findMany as jest.Mock).mockResolvedValue([equipo('a1', 's1'), equipo('a2', 's2')]);
});

describe.each(Object.entries(SESIONES))('%s', (_rol, sesion) => {
  beforeEach(() => (requirePermission as jest.Mock).mockResolvedValue(sesion));

  test('el detalle muestra la sede de cada equipo, sin su asignación', async () => {
    const cuerpo = await (await detalleCompra(new NextRequest('http://localhost/api/compras/c1'), ctx)).json();
    for (const pa of cuerpo.purchaseAssets) {
      expect(pa.asset.sede).toBeDefined();
      expect(pa.asset).not.toHaveProperty('empleadoActualId');
      expect(pa.asset).not.toHaveProperty('empleadoActual');
    }
  });

  test('la lista de equipos de la compra tampoco trae la asignación', async () => {
    const cuerpo = await (await equiposCompra(new NextRequest('http://localhost/api/compras/c1/activos'), ctx)).json();
    expect(cuerpo.data).toHaveLength(2);
    for (const pa of cuerpo.data) {
      expect(pa.asset).not.toHaveProperty('empleadoActualId');
      expect(pa.asset).not.toHaveProperty('empleadoActual');
    }
  });
});
