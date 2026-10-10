/**
 * @jest-environment node
 */
// Las dos rutas que dan de baja rechazan un equipo que sigue asignado (SPEC 2.106).
jest.mock('@/shared/prisma', () => ({
  prisma: {
    asset: { findUnique: jest.fn() },
    maintenance: { findUnique: jest.fn() },
    maintenanceType: { findUnique: jest.fn() },
    motivoBaja: { findFirst: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return {
    ...real,
    requirePermission: jest.fn().mockResolvedValue({ user: { id: 'u1', email: 'qa@scl.cl', role: 'admin', sedeId: null } }),
  };
});

import { NextRequest } from 'next/server';
import { prisma } from '@/shared/prisma';
import { POST as darDeBaja } from '@/app/api/activos/[id]/baja/route';
import { POST as completar } from '@/app/api/mantenciones/[id]/completar/route';

const transaccion = prisma.$transaction as jest.Mock;
const buscarActivo = prisma.asset.findUnique as jest.Mock;
const buscarMantencion = prisma.maintenance.findUnique as jest.Mock;
const buscarMotivo = prisma.motivoBaja.findFirst as jest.Mock;
const MOTIVO_ID = '33333333-3333-4333-8333-333333333333';

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
  // Motivo de la lista (SPEC 2.116.5).
  buscarMotivo.mockReset().mockResolvedValue({ id: MOTIVO_ID, nombre: 'Falla irreparable', clave: null });
});

describe('POST /api/activos/[id]/baja', () => {
  const ASSET_ID = '11111111-1111-4111-8111-111111111111';
  const body = { motivoBajaId: MOTIVO_ID, fechaBaja: '2026-09-25' };
  const params = { params: Promise.resolve({ id: ASSET_ID }) };

  test('en mantencion y asignado: 409 con el motivo, y no toca la base', async () => {
    buscarActivo.mockResolvedValue(activo('emp-1'));
    const res = await darDeBaja(peticion(`/api/activos/${ASSET_ID}/baja`, body), params);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Está asignado a un empleado/);
    expect(transaccion).not.toHaveBeenCalled();
  });

  test('en mantencion sin dueño (devuelto dañado): se da de baja', async () => {
    buscarActivo.mockResolvedValue(activo(null));
    const res = await darDeBaja(peticion(`/api/activos/${ASSET_ID}/baja`, body), params);
    expect(res.status).toBe(201);
    expect(transaccion).toHaveBeenCalled();
  });

  test('"Otro" sin detalle: 400 en el campo del detalle', async () => {
    buscarActivo.mockResolvedValue(activo(null));
    buscarMotivo.mockResolvedValue({ id: MOTIVO_ID, nombre: 'Otro', clave: 'otro' });
    const res = await darDeBaja(peticion(`/api/activos/${ASSET_ID}/baja`, body), params);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/motivoDetalle/);
    expect(transaccion).not.toHaveBeenCalled();
  });

  test('un motivo desactivado o que no existe: 400', async () => {
    buscarActivo.mockResolvedValue(activo(null));
    buscarMotivo.mockResolvedValue(null);
    const res = await darDeBaja(peticion(`/api/activos/${ASSET_ID}/baja`, body), params);
    expect(res.status).toBe(400);
    expect(buscarMotivo).toHaveBeenCalledWith({ where: { id: MOTIVO_ID, activo: true } });
  });
});

describe('POST /api/mantenciones/[id]/completar como "Sin reparación"', () => {
  const body = {
    fechaRealizada: '2026-09-25',
    realizadoPor: 'QA',
    resultado: 'No enciende',
    resultadoTipo: 'no_reparable',
    motivoBajaId: MOTIVO_ID,
    motivoDetalle: 'Placa dañada',
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
