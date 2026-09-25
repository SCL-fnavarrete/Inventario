// Orden de agenda del listado de mantenciones (SPEC 2.98).
jest.mock('@/lib/prisma', () => ({
  prisma: { maintenance: { count: jest.fn(), findMany: jest.fn() } },
}));

import { prisma } from '@/lib/prisma';
import {
  VISTAS_MANTENCION,
  filtroPeriodo,
  gruposAgenda,
  paginarPorGrupos,
  ventanaPeriodo,
} from '@/lib/queries/mantenciones';

const count = prisma.maintenance.count as jest.Mock;
const findMany = prisma.maintenance.findMany as jest.Mock;
const hoy = new Date('2026-09-24T00:00:00Z');

beforeEach(() => {
  count.mockReset();
  findMany.mockReset();
});

describe('gruposAgenda', () => {
  test('en proceso, proximas, vencidas y cerradas, en ese orden', () => {
    const [enProceso, proximas, vencidas, cerradas] = gruposAgenda(hoy);
    expect(enProceso.where).toEqual({ estado: 'en_proceso' });
    expect(proximas.where).toMatchObject({ estado: 'pendiente' });
    expect(vencidas.where).toEqual({ estado: 'pendiente', fechaProgramada: { lt: hoy } });
    expect(cerradas.where).toEqual({ estado: { in: ['completada', 'cancelada'] } });
  });
});

describe('paginarPorGrupos', () => {
  const grupos = gruposAgenda(hoy);

  test('la pagina 1 empieza por las en proceso y sigue con las proximas', async () => {
    count.mockResolvedValueOnce(2).mockResolvedValueOnce(5).mockResolvedValueOnce(77).mockResolvedValueOnce(9);
    findMany.mockResolvedValueOnce([{ id: 'p1' }, { id: 'p2' }]).mockResolvedValueOnce([{ id: 'x1' }, { id: 'x2' }]);
    const r = await paginarPorGrupos({}, grupos, 0, 4);
    expect(r.total).toBe(93);
    expect(r.data.map((d) => d.id)).toEqual(['p1', 'p2', 'x1', 'x2']);
    expect(findMany.mock.calls[1][0]).toMatchObject({ skip: 0, take: 2 });
  });

  test('una pagina posterior salta los grupos que ya se mostraron', async () => {
    count.mockResolvedValueOnce(2).mockResolvedValueOnce(5).mockResolvedValueOnce(77).mockResolvedValueOnce(9);
    findMany.mockResolvedValueOnce([{ id: 'v' }]);
    await paginarPorGrupos({}, grupos, 10, 1);
    // 10 - 2 en proceso - 5 proximas = saltar 3 vencidas
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(findMany.mock.calls[0][0]).toMatchObject({ where: { AND: [{}, grupos[2].where] }, skip: 3, take: 1 });
  });
});

describe('tarjetas de resumen como filtros (SPEC 2.107)', () => {

  test('la ventana del periodo se cuenta desde hoy; 0 es sin limite', () => {
    const v = ventanaPeriodo(hoy, 30, 30);
    expect(v.limiteProximas?.toISOString()).toBe('2026-10-24T00:00:00.000Z');
    expect(v.inicioCompletadas?.toISOString()).toBe('2026-08-25T00:00:00.000Z');
    const todas = ventanaPeriodo(hoy, 0, 0);
    expect(todas.limiteProximas).toBeNull();
    expect(todas.inicioCompletadas).toBeNull();
  });

  test('cada tarjeta tiene su condicion; proximas y completadas respetan el periodo', () => {
    const v = ventanaPeriodo(hoy, 7, 7);
    expect(VISTAS_MANTENCION.vencidas(v)).toEqual({ estado: 'pendiente', fechaProgramada: { lt: hoy } });
    expect(VISTAS_MANTENCION.proximas(v)).toEqual({
      estado: 'pendiente',
      fechaProgramada: { gte: hoy, lte: v.limiteProximas },
    });
    expect(VISTAS_MANTENCION.en_proceso()).toEqual({ estado: 'en_proceso' });
    expect(VISTAS_MANTENCION.completadas(v)).toEqual({
      estado: 'completada',
      fechaRealizada: { gte: v.inicioCompletadas },
    });
  });

  test('"Total" junta todas las tarjetas mas pendientes sin fecha y canceladas; sin limite no filtra', () => {
    const v = ventanaPeriodo(hoy, 30, 30);
    const periodo = filtroPeriodo(v);
    expect(periodo?.OR).toEqual(
      expect.arrayContaining([
        VISTAS_MANTENCION.vencidas(v),
        VISTAS_MANTENCION.proximas(v),
        VISTAS_MANTENCION.en_proceso(),
        VISTAS_MANTENCION.completadas(v),
        { estado: 'cancelada' },
      ])
    );
    expect(filtroPeriodo(ventanaPeriodo(hoy, 0, 0))).toBeNull();
  });
});
