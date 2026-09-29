/** @jest-environment node */
// Auditoria 28-sep-2026 (7.A-1): la venta solo se aplica si el equipo sigue de
// baja y sin empleado; si otra operacion lo cambio, responde 409.
jest.mock('@/shared/prisma', () => {
  const prisma: Record<string, unknown> = { asset: { findUnique: jest.fn() } };
  const tx = { asset: { update: jest.fn() } };
  prisma.$transaction = jest.fn((fn: (t: unknown) => unknown) => fn(tx));
  prisma.__tx = tx;
  return { prisma };
});
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/modules/activos/historial', () => ({
  assetHistoryService: { registrarVenta: jest.fn() },
}));

import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { requirePermission } from '@/shared/auth/guard';
import { POST as vender } from '@/app/api/activos/[id]/venta/route';

const tx = (prisma as unknown as { __tx: { asset: { update: jest.Mock } } }).__tx;
const pedir = () =>
  new NextRequest('http://localhost/api/activos/a1/venta', {
    method: 'POST',
    body: JSON.stringify({ comprador: 'Juan', monto: 100000, moneda: 'CLP', fechaVenta: '2026-09-28' }),
  });
const ctx = { params: Promise.resolve({ id: 'a1' }) };

beforeEach(() => {
  jest.clearAllMocks();
  (requirePermission as jest.Mock).mockResolvedValue({ user: { id: 'u', email: 'a@x.cl', role: 'admin', sedeId: null } });
  (prisma.asset.findUnique as jest.Mock).mockResolvedValue({
    id: 'a1', estado: 'baja', sedeId: 's1', deletedAt: null, assignments: [], categoria: {},
  });
});

test('la venta exige que el equipo siga de baja y sin empleado', async () => {
  tx.asset.update.mockResolvedValue({ id: 'a1', estado: 'vendido' });
  const res = await vender(pedir(), ctx);
  expect(res.status).toBe(200);
  expect(tx.asset.update.mock.calls[0][0].where).toEqual({ id: 'a1', estado: 'baja', empleadoActualId: null });
});

test('si otra operación lo cambió entre la lectura y la venta, responde 409', async () => {
  tx.asset.update.mockRejectedValue(
    new Prisma.PrismaClientKnownRequestError('Record to update not found.', { code: 'P2025', clientVersion: '5.22.0' })
  );
  const res = await vender(pedir(), ctx);
  expect(res.status).toBe(409);
});
