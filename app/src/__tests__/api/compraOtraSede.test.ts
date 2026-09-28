/** @jest-environment node */
// Auditoria 27-sep-2026, 2.12: un tecnico ve la compra completa, pero no
// quien tiene los equipos de otra sede.
jest.mock('@/lib/prisma', () => ({ prisma: { purchase: { findUnique: jest.fn() } } }));
jest.mock('@/lib/auth/guard', () => {
  const real = jest.requireActual('@/lib/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/lib/services/compraService', () => ({
  INCLUDE_AVANCE_REPARTO: {},
  avanceReparto: jest.fn(() => ({})),
  exigirSinReparto: jest.fn(),
  moverSedeDeLlegada: jest.fn(),
  quitarEquipo: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { GET } from '@/app/api/compras/[id]/route';

const persona = { id: 'e1', rut: '11.111.111-1', nombres: 'Ana', apellidoPaterno: 'Rojas' };
const equipo = (id: string, sedeId: string) => ({
  asset: { id, sedeId, deletedAt: null, empleadoActual: persona },
});

const pedir = async (sesion: unknown) => {
  (requirePermission as jest.Mock).mockResolvedValue(sesion);
  (prisma.purchase.findUnique as jest.Mock).mockResolvedValue({
    id: 'c1',
    purchaseAssets: [equipo('a1', 's1'), equipo('a2', 's2')],
    purchaseKitItems: [],
  });
  const res = await GET(new NextRequest('http://localhost/api/compras/c1'), {
    params: Promise.resolve({ id: 'c1' }),
  });
  const cuerpo = await res.json();
  return Object.fromEntries(
    cuerpo.purchaseAssets.map((pa: { asset: { id: string; empleadoActual: unknown } }) => [
      pa.asset.id,
      pa.asset.empleadoActual,
    ])
  );
};

test('técnico: ve a la persona solo en los equipos de su sede', async () => {
  const personas = await pedir({ user: { id: 'u', role: 'tecnico', sedeId: 's1' } });
  expect(personas).toEqual({ a1: persona, a2: null });
});

test('admin: ve a todas las personas', async () => {
  const personas = await pedir({ user: { id: 'u', role: 'admin', sedeId: null } });
  expect(personas).toEqual({ a1: persona, a2: persona });
});
