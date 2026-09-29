/**
 * @jest-environment node
 */
// Guias en transito (SPEC 2.108): recibir, resolver faltantes y anular.
jest.mock('@/shared/prisma', () => ({
  prisma: {
    dispatchGuide: { findUnique: jest.fn() },
    // El equipo perdido usa el motivo "Extravío" de la lista (SPEC 2.116.5).
    motivoBaja: { findFirst: jest.fn().mockResolvedValue({ id: 'mb-extravio', nombre: 'Extravío', clave: 'extravio' }) },
    $transaction: jest.fn(),
  },
}));
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return { ...real, requirePermission: jest.fn() };
});
jest.mock('@/shared/auditoria', () => ({
  auditLogService: { registrarActualizacion: jest.fn() },
}));
jest.mock('@/modules/mantenciones/servicio', () => ({
  tipoCorrectivaPorDefecto: jest.fn().mockResolvedValue({ id: 't1', nombre: 'Correctiva' }),
  darDeBajaEnTransaccion: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { prisma } from '@/shared/prisma';
import { requirePermission } from '@/shared/auth/guard';
import { darDeBajaEnTransaccion } from '@/modules/mantenciones/servicio';
import { PATCH as recibir } from '@/app/api/guias-despacho/[id]/route';
import { POST as resolverItem } from '@/app/api/guias-despacho/[id]/items/[itemId]/route';
import { POST as anular } from '@/app/api/guias-despacho/[id]/anular/route';
import { POST as resolverKitRuta } from '@/app/api/guias-despacho/[id]/kit/[lineaId]/route';

const sesion = (role: string, sedeId: string | null) => ({
  user: { id: 'u1', email: 'qa@scl.cl', name: 'QA', role, sedeId },
});
const comoDestino = () => (requirePermission as jest.Mock).mockResolvedValue(sesion('tecnico', 'conce'));
const comoOrigen = () => (requirePermission as jest.Mock).mockResolvedValue(sesion('tecnico', 'stgo'));

const item = (id: string, estado = 'en_transito', estadoEquipo = 'en_transito') => ({
  id,
  assetId: `activo-${id}`,
  estado,
  asset: { marca: 'Dell', modelo: 'Latitude', estado: estadoEquipo },
});

// Linea de Kit/EPP del despacho (SPEC 2.111.4)
const lineaKit = (cantidad = 4, cantidadRecibida = 0, cantidadPerdida = 0) => ({
  id: 'k1',
  itemId: 'casco-stgo',
  itemDestinoId: null,
  cantidad,
  cantidadRecibida,
  cantidadPerdida,
  motivoPerdida: null,
  estado: 'en_transito',
  item: { id: 'casco-stgo', nombre: 'Casco', categoria: 'epp', stockMinimo: 5 },
});

const guia = (
  estado: string,
  items: ReturnType<typeof item>[] = [item('i1'), item('i2')],
  kitItems: ReturnType<typeof lineaKit>[] = [],
  purchaseId: string | null = null
) => ({
  id: 'g1',
  numero: 'GD-2026-0001',
  estado,
  sedeId: 'stgo',
  sedeDestinoId: 'conce',
  sede: { nombre: 'Santiago' },
  sedeDestino: { nombre: 'Concepción' },
  fechaDespacho: new Date('2026-09-25T13:00:00.000Z'),
  items,
  kitItems,
  purchaseId,
});

// Transaccion simulada: registra lo que se escribe.
let tx: Record<string, Record<string, jest.Mock>>;
let pendientesTrasRecepcion = 0;
let kitPendiente = 0;

beforeEach(() => {
  pendientesTrasRecepcion = 0;
  kitPendiente = 0;
  tx = {
    dispatchGuideKitItem: {
      count: jest.fn(() => Promise.resolve(kitPendiente)),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    welcomeKitItem: {
      findFirst: jest.fn().mockResolvedValue({ id: 'casco-conce' }),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({ id: 'casco-conce', nombre: 'Casco', cantidad: 3 }),
    },
    purchaseKitReparto: { findMany: jest.fn().mockResolvedValue([]) },
    purchaseKitItem: { update: jest.fn() },
    dispatchGuideItem: {
      findMany: jest.fn(({ where }) =>
        Promise.resolve(where.id.in.map((id: string) => ({ id, assetId: `activo-${id}` })))
      ),
      update: jest.fn(),
      count: jest.fn(() => Promise.resolve(pendientesTrasRecepcion)),
    },
    asset: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
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
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'activo-i1', estado: 'en_transito', deletedAt: null },
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

  // SPEC 2.117: la sede no restringe. Un tecnico de otra sede cubre la destino.
  test('un tecnico de otra sede tambien confirma la recepcion', async () => {
    (requirePermission as jest.Mock).mockResolvedValue(sesion('tecnico', 'arica'));
    buscarGuia(guia('en_transito'));
    expect((await recibir(pedir('PATCH', body), ctx)).status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
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
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'activo-i1', estado: 'en_transito', deletedAt: null },
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
      expect.objectContaining({
        motivoBajaId: 'mb-extravio',
        motivoTexto: expect.stringMatching(/^Extravío: No venía en la caja/),
      })
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

  test('la sede que despacho tambien resuelve faltantes (SPEC 2.117)', async () => {
    comoOrigen();
    buscarGuia(guia('recibida_parcial'));
    expect((await resolverItem(pedir('POST', { accion: 'llego' }), ctxItem)).status).toBe(200);
  });
});

describe('POST /api/guias-despacho/[id]/anular', () => {
  test('la sede que despacho anula: los equipos vuelven a Disponible en su sede', async () => {
    comoOrigen();
    buscarGuia(guia('en_transito'));
    const res = await anular(pedir('POST', { motivo: 'Se envió a la sede equivocada' }), ctx);
    expect(res.status).toBe(200);
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'activo-i1', estado: 'en_transito', deletedAt: null },
      data: { estado: 'disponible' },
    });
    expect(tx.dispatchGuide.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ estado: 'anulada' }) })
    );
  });

  test('la sede destino tambien puede anular (SPEC 2.117)', async () => {
    comoDestino();
    buscarGuia(guia('en_transito'));
    expect((await anular(pedir('POST', { motivo: 'x' }), ctx)).status).toBe(200);
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

// ─── Kit/EPP en un despacho y "Apareció" (SPEC 2.111.4) ─────────────────

const ctxKit = { params: Promise.resolve({ id: 'g1', lineaId: 'k1' }) };

describe('recepción con Kit/EPP', () => {
  test('un despacho solo con Kit/EPP se recibe: suma stock en la sede destino y quedan faltantes', async () => {
    comoDestino();
    buscarGuia(guia('en_transito', [], [lineaKit(4)]));
    tx.dispatchGuideKitItem.findFirst.mockResolvedValue(lineaKit(4));
    kitPendiente = 1;
    const res = await recibir(
      pedir('PATCH', { recibidoPor: 'Ana', llegaron: [], kitRecibido: [{ lineaId: 'k1', cantidad: 3 }] }),
      ctx
    );
    expect(res.status).toBe(200);
    // El mismo articulo en Concepcion, +3
    expect(tx.welcomeKitItem.update).toHaveBeenCalledWith({
      where: { id: 'casco-conce' },
      data: { cantidad: { increment: 3 } },
    });
    expect(tx.dispatchGuideKitItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidadRecibida: 3, estado: 'en_transito', itemDestinoId: 'casco-conce' }),
      })
    );
    expect(tx.dispatchGuide.update).toHaveBeenLastCalledWith({ where: { id: 'g1' }, data: { estado: 'recibida_parcial' } });
  });

  test('sin equipos ni cantidades: 400', async () => {
    comoDestino();
    buscarGuia(guia('en_transito', [], [lineaKit(4)]));
    const res = await recibir(pedir('PATCH', { recibidoPor: 'Ana', llegaron: [], kitRecibido: [] }), ctx);
    expect(res.status).toBe(400);
  });
});

describe('POST /api/guias-despacho/[id]/kit/[lineaId]', () => {
  test('"Se perdió" sin motivo: 400', async () => {
    comoDestino();
    buscarGuia(guia('recibida_parcial', [], [lineaKit(4, 3)]));
    const res = await resolverKitRuta(pedir('POST', { accion: 'perdido', cantidad: 1 }), ctxKit);
    expect(res.status).toBe(400);
  });

  test('no se pierde más de lo pendiente: 400 en el campo cantidad', async () => {
    comoDestino();
    buscarGuia(guia('recibida_parcial', [], [lineaKit(4, 3)]));
    tx.dispatchGuideKitItem.findFirst.mockResolvedValue(lineaKit(4, 3));
    const res = await resolverKitRuta(pedir('POST', { accion: 'perdido', cantidad: 2, motivo: 'no vino' }), ctxKit);
    expect(res.status).toBe(400);
    expect(JSON.stringify(await res.json())).toMatch(/cantidad/);
  });

  test('"Se perdió" no toca el stock y deja el despacho Recibido si ya no queda nada', async () => {
    comoDestino();
    buscarGuia(guia('recibida_parcial', [], [lineaKit(4, 3)]));
    tx.dispatchGuideKitItem.findFirst.mockResolvedValue(lineaKit(4, 3));
    const res = await resolverKitRuta(pedir('POST', { accion: 'perdido', cantidad: 1, motivo: 'no vino' }), ctxKit);
    expect(res.status).toBe(200);
    expect(tx.welcomeKitItem.update).not.toHaveBeenCalled();
    expect(tx.dispatchGuideKitItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ cantidadPerdida: 1, estado: 'perdido' }) })
    );
    expect(tx.dispatchGuide.update).toHaveBeenLastCalledWith({ where: { id: 'g1' }, data: { estado: 'recibida' } });
  });

  test('"Apareció": pasa de perdido a recibido y suma stock', async () => {
    comoDestino();
    buscarGuia(guia('recibida', [], [lineaKit(4, 3, 1)]));
    tx.dispatchGuideKitItem.findFirst.mockResolvedValue(lineaKit(4, 3, 1));
    const res = await resolverKitRuta(pedir('POST', { accion: 'aparecio', cantidad: 1 }), ctxKit);
    expect(res.status).toBe(200);
    expect(tx.welcomeKitItem.update).toHaveBeenCalledWith({
      where: { id: 'casco-conce' },
      data: { cantidad: { increment: 1 } },
    });
    expect(tx.dispatchGuideKitItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ cantidadRecibida: 4, cantidadPerdida: 0, estado: 'recibido' }),
      })
    );
  });

  test('la sede que despachó también resuelve Kit/EPP (SPEC 2.117)', async () => {
    comoOrigen();
    buscarGuia(guia('recibida_parcial', [], [lineaKit(4, 3)]));
    tx.dispatchGuideKitItem.findFirst.mockResolvedValue(lineaKit(4, 3));
    expect((await resolverKitRuta(pedir('POST', { accion: 'llego', cantidad: 1 }), ctxKit)).status).toBe(200);
  });
});

describe('"Apareció" de un equipo perdido en el despacho', () => {
  test('sale de la baja y queda Disponible en la sede destino', async () => {
    comoDestino();
    buscarGuia(guia('recibida', [item('i1', 'perdido', 'baja'), item('i2', 'recibido', 'disponible')]));
    const res = await resolverItem(pedir('POST', { accion: 'aparecio' }), ctxItem);
    expect(res.status).toBe(200);
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'activo-i1', estado: 'baja', deletedAt: null },
      data: { estado: 'disponible', sedeId: 'conce', fechaBaja: null },
    });
    expect(tx.dispatchGuideItem.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'i1' }, data: expect.objectContaining({ estado: 'recibido' }) })
    );
  });

  test('si el equipo ya se vendió: 409', async () => {
    comoDestino();
    buscarGuia(guia('recibida', [item('i1', 'perdido', 'vendido')]));
    const res = await resolverItem(pedir('POST', { accion: 'aparecio' }), ctxItem);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/vendido/);
  });

  test('un equipo que no está perdido no "aparece": 409', async () => {
    comoDestino();
    buscarGuia(guia('recibida', [item('i1', 'recibido', 'disponible')]));
    expect((await resolverItem(pedir('POST', { accion: 'aparecio' }), ctxItem)).status).toBe(409);
  });
});

describe('anular un despacho de reparto (SPEC 2.111.5)', () => {
  test('los equipos vuelven a Por repartir y el Kit/EPP a lo pendiente de la compra', async () => {
    comoOrigen();
    buscarGuia(guia('en_transito', [item('i1')], [lineaKit(4)], 'compra-1'));
    tx.purchaseKitReparto.findMany.mockResolvedValue([{ purchaseKitItemId: 'l1', cantidad: 4 }]);
    const res = await anular(pedir('POST', { motivo: 'Se repartió a la sede equivocada' }), ctx);
    expect(res.status).toBe(200);
    expect(tx.asset.updateMany).toHaveBeenCalledWith({
      where: { id: 'activo-i1', estado: 'en_transito', deletedAt: null },
      data: { estado: 'por_repartir' },
    });
    expect(tx.purchaseKitItem.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { cantidadPorRepartir: { increment: 4 } },
    });
  });

  test('con Kit/EPP ya recibido no se anula: 409', async () => {
    comoOrigen();
    buscarGuia(guia('en_transito', [item('i1')], [lineaKit(4, 1)], 'compra-1'));
    expect((await anular(pedir('POST', { motivo: 'x' }), ctx)).status).toBe(409);
  });
});
