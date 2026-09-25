/**
 * @jest-environment node
 */
// Guias en transito (SPEC 2.108): recibir, resolver faltantes y anular.
jest.mock('@/lib/prisma', () => ({
  prisma: {
    dispatchGuide: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/lib/auth/guard', () => {
  const real = jest.requireActual('@/lib/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/lib/services/auditLogService', () => ({
  auditLogService: { registrarActualizacion: jest.fn() },
}));
jest.mock('@/lib/services/mantencionActivoService', () => ({
  tipoCorrectivaPorDefecto: jest.fn().mockResolvedValue({ id: 't1', nombre: 'Correctiva' }),
  darDeBajaEnTransaccion: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth/guard';
import { darDeBajaEnTransaccion } from '@/lib/services/mantencionActivoService';
import { PATCH as recibir } from '@/app/api/guias-despacho/[id]/route';
import { POST as resolverItem } from '@/app/api/guias-despacho/[id]/items/[itemId]/route';
import { POST as anular } from '@/app/api/guias-despacho/[id]/anular/route';

const sesion = (role: string, sedeId: string | null) => ({
  user: { id: 'u1', email: 'qa@scl.cl', name: 'QA', role, sedeId },
});
const comoDestino = () => (requirePermission as jest.Mock).mockResolvedValue(sesion('tecnico', 'conce'));
const comoOrigen = () => (requirePermission as jest.Mock).mockResolvedValue(sesion('tecnico', 'stgo'));

const item = (id: string, estado = 'en_transito') => ({
  id,
  assetId: `activo-${id}`,
  estado,
  asset: { marca: 'Dell', modelo: 'Latitude' },
});

const guia = (estado: string, items = [item('i1'), item('i2')]) => ({
  id: 'g1',
  numero: 'GD-2026-0001',
  estado,
  sedeId: 'stgo',
  sedeDestinoId: 'conce',
  sede: { nombre: 'Santiago' },
  sedeDestino: { nombre: 'Concepción' },
  fechaDespacho: new Date('2026-09-25T13:00:00.000Z'),
  items,
});

// Transaccion simulada: registra lo que se escribe.
let tx: Record<string, Record<string, jest.Mock>>;
let pendientesTrasRecepcion = 0;

beforeEach(() => {
  pendientesTrasRecepcion = 0;
  tx = {
    dispatchGuideItem: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(where.id.in.map((id: string) => ({ id, assetId: `activo-${id}` })))
      ),
      update: jest.fn(),
      count: jest.fn(() => Promise.resolve(pendientesTrasRecepcion)),
    },
    asset: {
      update: jest.fn(),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'activo-i1', maintenances: [] }),
    },
    assetHistory: { create: jest.fn() },
    dispatchGuide: { update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'g1' }) },
  };
  (prisma.$transaction as jest.Mock).mockReset().mockImplementation((fn) => fn(tx));
  (darDeBajaEnTransaccion as jest.Mock).mockClear();
});

const buscarGuia = (g: ReturnType<typeof guia>) =>
  (prisma.dispatchGuide.findUnique as jest.Mock).mockResolvedValue(g);

const pedir = (method: string, body: unknown) =>
  new NextRequest('http://localhost/api/guias-despacho/g1', { method, body: JSON.stringify(body) });
const ctx = { params: Promise.resolve({ id: 'g1' }) };
const ctxItem = { params: Promise.resolve({ id: 'g1', itemId: 'i1' }) };

describe('PATCH /api/guias-despacho/[id] (confirmar recepcion)', () => {
  const body = { recibidoPor: 'Ana', fechaRecepcion: '2026-09-26T10:00:00.000Z', llegaron: ['i1', 'i2'] };

  test('la sede destino recibe todo: los equipos pasan a su sede y la guia queda Recibida', async () => {
    comoDestino();
    buscarGuia(guia('en_transito'));
    const res = await recibir(pedir('PATCH', body), ctx);
    expect(res.status).toBe(200);
    expect(tx.asset.update).toHaveBeenCalledWith({
      where: { id: 'activo-i1' },
      data: { estado: 'disponible', sedeId: 'conce' },
    });
    expect(tx.dispatchGuide.update).toHaveBeenLastCalledWith({ where: { id: 'g1' }, data: { estado: 'recibida' } });
  });

  test('si falta alguno, la guia queda "con faltantes"', async () => {
    comoDestino();
    buscarGuia(guia('en_transito'));
    pendientesTrasRecepcion = 1;
    await recibir(pedir('PATCH', { ...body, llegaron: ['i1'] }), ctx);
    expect(tx.dispatchGuide.update).toHaveBeenLastCalledWith({
      where: { id: 'g1' },
      data: { estado: 'recibida_parcial' },
    });
  });

  test('la sede que despacho no puede confirmar la recepcion', async () => {
    comoOrigen();
    buscarGuia(guia('en_transito'));
    const res = await recibir(pedir('PATCH', body), ctx);
    expect(res.status).toBe(403);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('otra sede ni siquiera ve la guia: 404', async () => {
    (requirePermission as jest.Mock).mockResolvedValue(sesion('tecnico', 'arica'));
    buscarGuia(guia('en_transito'));
    expect((await recibir(pedir('PATCH', body), ctx)).status).toBe(404);
  });

  test('recepcion anterior al envio o sin equipos marcados: 400 por campo', async () => {
    comoDestino();
    buscarGuia(guia('en_transito'));
    const res = await recibir(
      pedir('PATCH', { recibidoPor: 'Ana', fechaRecepcion: '2026-09-24T10:00:00.000Z', llegaron: [] }),
      ctx
    );
    expect(res.status).toBe(400);
    const json = JSON.stringify(await res.json());
    expect(json).toMatch(/anterior/);
    expect(json).toMatch(/al menos un equipo/);
  });

  test('una guia ya recibida no se vuelve a recibir: 409', async () => {
    comoDestino();
    buscarGuia(guia('recibida'));
    expect((await recibir(pedir('PATCH', body), ctx)).status).toBe(409);
  });
});

describe('POST /api/guias-despacho/[id]/items/[itemId] (resolver faltante)', () => {
  test('"Llegó" en una guia con faltantes lo pasa a la sede destino', async () => {
    comoDestino();
    buscarGuia(guia('recibida_parcial', [item('i1'), item('i2', 'recibido')]));
    const res = await resolverItem(pedir('POST', { accion: 'llego' }), ctxItem);
    expect(res.status).toBe(200);
    expect(tx.asset.update).toHaveBeenCalledWith({
      where: { id: 'activo-i1' },
      data: { estado: 'disponible', sedeId: 'conce' },
    });
    expect(tx.dispatchGuide.update).toHaveBeenLastCalledWith({ where: { id: 'g1' }, data: { estado: 'recibida' } });
  });

  test('"Llegó" antes de confirmar la recepcion: 409', async () => {
    comoDestino();
    buscarGuia(guia('en_transito'));
    expect((await resolverItem(pedir('POST', { accion: 'llego' }), ctxItem)).status).toBe(409);
  });

  test('"Se perdió" da de baja por Extravío y marca el equipo perdido', async () => {
    comoDestino();
    buscarGuia(guia('recibida_parcial', [item('i1'), item('i2', 'recibido')]));
    const res = await resolverItem(pedir('POST', { accion: 'perdido', motivo: 'No venía en la caja' }), ctxItem);
    expect(res.status).toBe(200);
    expect(darDeBajaEnTransaccion).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ motivoTexto: expect.stringMatching(/^Extravío: No venía en la caja/) })
    );
    expect(tx.dispatchGuideItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1' }, data: expect.objectContaining({ estado: 'perdido' }) })
    );
  });

  test('"Se perdió" sin motivo: 400 y no da de baja', async () => {
    comoDestino();
    buscarGuia(guia('en_transito'));
    const res = await resolverItem(pedir('POST', { accion: 'perdido', motivo: ' ' }), ctxItem);
    expect(res.status).toBe(400);
    expect(darDeBajaEnTransaccion).not.toHaveBeenCalled();
  });

  test('un equipo ya resuelto no se resuelve de nuevo: 409', async () => {
    comoDestino();
    buscarGuia(guia('recibida_parcial', [item('i1', 'recibido'), item('i2')]));
    expect((await resolverItem(pedir('POST', { accion: 'llego' }), ctxItem)).status).toBe(409);
  });

  test('la sede que despacho no resuelve faltantes: 403', async () => {
    comoOrigen();
    buscarGuia(guia('recibida_parcial'));
    expect((await resolverItem(pedir('POST', { accion: 'llego' }), ctxItem)).status).toBe(403);
  });
});

describe('POST /api/guias-despacho/[id]/anular', () => {
  test('la sede que despacho anula: los equipos vuelven a Disponible en su sede', async () => {
    comoOrigen();
    buscarGuia(guia('en_transito'));
    const res = await anular(pedir('POST', { motivo: 'Se envió a la sede equivocada' }), ctx);
    expect(res.status).toBe(200);
    expect(tx.asset.update).toHaveBeenCalledWith({ where: { id: 'activo-i1' }, data: { estado: 'disponible' } });
    expect(tx.dispatchGuide.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'anulada' }) })
    );
  });

  test('la sede destino no puede anular: 403', async () => {
    comoDestino();
    buscarGuia(guia('en_transito'));
    expect((await anular(pedir('POST', { motivo: 'x' }), ctx)).status).toBe(403);
  });

  test('una guia ya recibida (aunque sea en parte) no se anula: 409', async () => {
    comoOrigen();
    buscarGuia(guia('recibida_parcial'));
    expect((await anular(pedir('POST', { motivo: 'x' }), ctx)).status).toBe(409);
  });

  test('sin motivo: 400', async () => {
    comoOrigen();
    buscarGuia(guia('en_transito'));
    expect((await anular(pedir('POST', { motivo: '' }), ctx)).status).toBe(400);
  });
});
