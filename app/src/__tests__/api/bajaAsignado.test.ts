/**
 * @jest-environment node
 */
// Las dos rutas que dan de baja rechazan un equipo que sigue asignado (SPEC 2.106).
jest.mock('@/lib/prisma', () => ({
  prisma: {
    asset: { findUnique: jest.fn() },
    maintenance: { findUnique: jest.fn() },
    maintenanceType: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/lib/auth/guard', () => {
  const real = jest.requireActual('@/lib/auth/guard');
  return {
    ...real,
    requirePermission: jest.fn().mockResolvedValue({ user: { id: 'u1', email: 'qa@scl.cl', role: 'admin', sedeId: null } }),
  };
});
jest.mock('@/lib/auth/sedeScope', () => ({ assertSedeAccess: jest.fn() }));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST as darDeBaja } from '@/app/api/mantenciones/baja/route';
import { POST as completar } from '@/app/api/mantenciones/[id]/completar/route';

const transaccion = prisma.$transaction as jest.Mock;
const buscarActivo = prisma.asset.findUnique as jest.Mock;
const buscarMantencion = prisma.maintenance.findUnique as jest.Mock;

const peticion = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: 'POST', body: JSON.stringify(body) });

const activo = (empleadoActualId: string | null) => ({
  id: '11111111-1111-4111-8111-111111111111',
  estado: 'en_mantencion',
  empleadoActualId,
  sedeId: 's1',
  deletedAt: null,
  condicion: 'usado',
  marca: 'QA',
  modelo: 'X',
  maintenances: [],
});

beforeEach(() => {
  transaccion.mockReset().mockResolvedValue({ id: 'm1' });
  buscarActivo.mockReset();
  buscarMantencion.mockReset();
});

describe('POST /api/mantenciones/baja', () => {
  const body = {
    assetId: '11111111-1111-4111-8111-111111111111',
    tipoId: '22222222-2222-4222-8222-222222222222',
    motivo: 'falla_irreparable',
    fechaRealizada: '2026-09-25',
    realizadoPor: 'QA',
  };

  test('en mantencion y asignado: 409 con el motivo, y no toca la base', async () => {
    buscarActivo.mockResolvedValue(activo('emp-1'));
    const res = await darDeBaja(peticion('/api/mantenciones/baja', body));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Está asignado a un empleado/);
    expect(transaccion).not.toHaveBeenCalled();
  });

  test('en mantencion sin dueño (devuelto dañado): se da de baja', async () => {
    buscarActivo.mockResolvedValue(activo(null));
    (prisma.maintenanceType.findUnique as jest.Mock).mockResolvedValue({ id: 't1', nombre: 'Correctiva' });
    const res = await darDeBaja(peticion('/api/mantenciones/baja', body));
    expect(res.status).toBe(201);
    expect(transaccion).toHaveBeenCalled();
  });
});

describe('POST /api/mantenciones/[id]/completar como "Sin reparación"', () => {
  const body = {
    fechaRealizada: '2026-09-25',
    realizadoPor: 'QA',
    resultado: 'No enciende',
    resultadoTipo: 'no_reparable',
    motivoBaja: 'Placa dañada',
  };
  const params = { params: Promise.resolve({ id: 'm1' }) };
  const mantencion = (empleadoActualId: string | null) => ({
    id: 'm1',
    estado: 'en_proceso',
    tipo: { nombre: 'Correctiva' },
    asset: activo(empleadoActualId),
  });

  test('equipo asignado: 409 con el motivo, y no toca la base', async () => {
    buscarMantencion.mockResolvedValue(mantencion('emp-1'));
    const res = await completar(peticion('/api/mantenciones/m1/completar', body), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Está asignado a un empleado/);
    expect(transaccion).not.toHaveBeenCalled();
  });

  test('equipo sin dueño: se completa y da de baja', async () => {
    buscarMantencion.mockResolvedValue(mantencion(null));
    const res = await completar(peticion('/api/mantenciones/m1/completar', body), params);
    expect(res.status).toBe(200);
    expect(transaccion).toHaveBeenCalled();
  });
});
