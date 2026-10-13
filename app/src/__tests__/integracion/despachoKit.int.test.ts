/**
 * Despacho manual con Kit/EPP (SPEC 2.145), contra Postgres real (solo la base de
 * pruebas): el stock sale de la sede origen al crear, vuelve al anular y suma a la
 * sede destino al recibir.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { registrarDespacho, confirmarRecepcion, anularDespacho } from '@/modules/despachos/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('despacho con Kit/EPP, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const quien = { usuario: `tec${s}`, nombre: 'Tecnico Prueba' };
  const guias: string[] = [];

  const stock = async (itemId: string) => (await prisma.welcomeKitItem.findUniqueOrThrow({ where: { id: itemId } })).cantidad;
  const despachar = async (extra: object) => {
    const g = await registrarDespacho(
      {
        sedeId: ids.origen,
        sedeDestinoId: ids.destino,
        otChilexpress: `OT${s}`,
        fechaDespacho: new Date(Date.now() - 60_000).toISOString(),
        receptorNombre: 'Receptor Prueba',
        receptorRut: '11.111.111-1',
        ...extra,
      },
      quien
    );
    guias.push(g.id);
    return g;
  };

  beforeAll(async () => {
    ids.origen = (await prisma.sede.create({ data: { codigo: `O${s}`, nombre: `Origen ${s}` } })).id;
    ids.destino = (await prisma.sede.create({ data: { codigo: `D${s}`, nombre: `Destino ${s}` } })).id;
    ids.otraSede = (await prisma.sede.create({ data: { codigo: `X${s}`, nombre: `Otra ${s}` } })).id;
  });
  let n = 0;
  beforeEach(async () => {
    // Un articulo nuevo por prueba: cada una parte con 10 y no pisa a las otras.
    n += 1;
    ids.nombre = `Mouse ${s} ${n}`;
    ids.item = (await prisma.welcomeKitItem.create({ data: { nombre: ids.nombre, categoria: 'epp', cantidad: 10, sedeId: ids.origen } })).id;
  });

  afterAll(async () => {
    const articulos = await prisma.welcomeKitItem.findMany({ where: { sedeId: { in: [ids.origen, ids.destino, ids.otraSede] } }, select: { id: true } });
    const idsArticulos = articulos.map((a) => a.id);
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: [...guias, ...idsArticulos] } } });
    await prisma.dispatchGuideKitItem.deleteMany({ where: { guideId: { in: guias } } });
    await prisma.dispatchGuide.deleteMany({ where: { id: { in: guias } } });
    await prisma.welcomeKitItem.deleteMany({ where: { id: { in: idsArticulos } } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.origen, ids.destino, ids.otraSede] } } });
    await prisma.$disconnect();
  });

  test('solo Kit/EPP: sale del stock de la sede origen al crear', async () => {
    const guia = await despachar({ kit: [{ itemId: ids.item, cantidad: 4 }] });
    expect(guia.items).toHaveLength(0);
    expect(await stock(ids.item)).toBe(6);
    expect(await prisma.dispatchGuideKitItem.findMany({ where: { guideId: guia.id } })).toMatchObject([{ itemId: ids.item, cantidad: 4 }]);
  });

  test('no se despacha más de lo que hay, ni artículos de otra sede, ni sin nada', async () => {
    await expect(despachar({ kit: [{ itemId: ids.item, cantidad: 11 }] })).rejects.toThrow(/No alcanza el stock/);
    const ajeno = await prisma.welcomeKitItem.create({ data: { nombre: `Ajeno ${s}`, categoria: 'epp', cantidad: 5, sedeId: ids.otraSede } });
    await expect(despachar({ kit: [{ itemId: ajeno.id, cantidad: 1 }] })).rejects.toThrow(/no son de la sede origen/);
    await expect(despachar({ kit: [{ itemId: ids.item, cantidad: 0 }] })).rejects.toThrow(/cantidad entera/);
    await expect(despachar({ kit: [] })).rejects.toThrow();
    expect(await stock(ids.item)).toBe(10);
  });

  test('al anular, el stock vuelve a la sede origen', async () => {
    const guia = await despachar({ kit: [{ itemId: ids.item, cantidad: 3 }] });
    expect(await stock(ids.item)).toBe(7);
    await anularDespacho(guia.id, 'Se envió mal', quien, async () => undefined);
    expect(await stock(ids.item)).toBe(10);
  });

  test('al recibir, el stock suma a la sede destino', async () => {
    const guia = await despachar({ kit: [{ itemId: ids.item, cantidad: 5 }] });
    const linea = await prisma.dispatchGuideKitItem.findFirstOrThrow({ where: { guideId: guia.id } });
    const recibida = await confirmarRecepcion(guia.id, { fechaRecepcion: new Date().toISOString(), kitRecibido: [{ lineaId: linea.id, cantidad: 5 }] }, quien);
    expect(recibida.estado).toBe('recibida');
    expect(await stock(ids.item)).toBe(5);
    const destino = await prisma.welcomeKitItem.findFirstOrThrow({ where: { sedeId: ids.destino, nombre: ids.nombre } });
    expect(destino.cantidad).toBe(5);
  });
});
