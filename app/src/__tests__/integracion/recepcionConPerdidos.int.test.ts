/**
 * Recepcion de un despacho con algo ya perdido (SPEC 2.145): lo perdido no se vuelve a
 * recibir. Equipos y Kit/EPP, contra Postgres real (solo la base de pruebas).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { registrarDespacho, confirmarRecepcion, resolverEquipoDespacho, resolverKitDespacho } from '@/modules/despachos/servidor';
import { crearEquipo } from '@/test-utils/catalogos';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('recepcion de un despacho con perdidos, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const quien = { usuario: `tec${s}`, nombre: 'Tecnico Prueba' };
  const guias: string[] = [];

  const equipo = (modelo: string) =>
    crearEquipo({ categoriaId: ids.categoria, sedeId: ids.origen, marca: 'Dell', modelo: `${modelo} ${s}`, estado: 'disponible' });
  const despachar = async (assetIds: string[]) => {
    const g = await registrarDespacho(
      {
        sedeId: ids.origen,
        sedeDestinoId: ids.destino,
        otChilexpress: `OT${s}`,
        fechaDespacho: new Date(Date.now() - 60_000).toISOString(),
        receptorNombre: 'Receptor Prueba',
        receptorRut: '11.111.111-1',
        assetIds,
      },
      quien
    );
    guias.push(g.id);
    return g;
  };
  const recepcion = { fechaRecepcion: new Date().toISOString() };

  beforeAll(async () => {
    ids.origen = (await prisma.sede.create({ data: { codigo: `O${s}`, nombre: `Origen ${s}` } })).id;
    ids.destino = (await prisma.sede.create({ data: { codigo: `D${s}`, nombre: `Destino ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cat Rec ${s}`, tipoFicha: 'computador' } })).id;
    ids.extravio = (await prisma.motivoBaja.findUniqueOrThrow({ where: { clave: 'extravio' } })).id;
  });

  afterAll(async () => {
    const equipos = await prisma.asset.findMany({ where: { categoriaId: ids.categoria }, select: { id: true } });
    const idsEquipos = equipos.map((e) => e.id);
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: guias } } });
    await prisma.dispatchGuideKitItem.deleteMany({ where: { guideId: { in: guias } } });
    await prisma.dispatchGuideItem.deleteMany({ where: { guideId: { in: guias } } });
    await prisma.dispatchGuide.deleteMany({ where: { id: { in: guias } } });
    await prisma.maintenance.deleteMany({ where: { assetId: { in: idsEquipos } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: idsEquipos } } });
    await prisma.asset.deleteMany({ where: { id: { in: idsEquipos } } });
    const articulos = await prisma.welcomeKitItem.findMany({ where: { sedeId: { in: [ids.origen, ids.destino] } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: articulos.map((x) => x.id) } } });
    await prisma.welcomeKitItem.deleteMany({ where: { id: { in: articulos.map((x) => x.id) } } });
    await prisma.assetCategory.delete({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.origen, ids.destino] } } });
    await prisma.$disconnect();
  });

  test('un equipo perdido antes de la recepcion no se recibe aunque venga marcado', async () => {
    const a = await equipo('A');
    const b = await equipo('B');
    const guia = await despachar([a.id, b.id]);
    const itemA = guia.items.find((i) => i.assetId === a.id)!;
    const itemB = guia.items.find((i) => i.assetId === b.id)!;

    await resolverEquipoDespacho(guia.id, itemA.id, 'perdido', 'Se extravio', quien);
    // Solo el perdido marcado: no hay nada que recibir.
    await expect(confirmarRecepcion(guia.id, { ...recepcion, llegaron: [itemA.id] }, quien)).rejects.toThrow();
    // Los dos marcados: llega el B, el A sigue dado de baja.
    const recibida = await confirmarRecepcion(guia.id, { ...recepcion, llegaron: [itemA.id, itemB.id] }, quien);
    expect(recibida.estado).toBe('recibida');
    // Quien recibe es el receptor indicado al crear: no se pregunta de nuevo.
    expect(recibida.recibidoPor).toBe('Receptor Prueba');
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: a.id } })).toMatchObject({ estado: 'baja', motivoBajaId: ids.extravio });
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: b.id } })).toMatchObject({ estado: 'disponible', sedeId: ids.destino });
  });

  test('Kit/EPP: lo perdido antes de la recepcion no cuenta como pendiente', async () => {
    const e = await equipo('K');
    const guia = await despachar([e.id]);
    const item = await prisma.welcomeKitItem.create({ data: { nombre: `Mouse ${s}`, categoria: 'epp', cantidad: 10, sedeId: ids.origen } });
    const linea = await prisma.dispatchGuideKitItem.create({ data: { guideId: guia.id, itemId: item.id, cantidad: 5 } });

    await resolverKitDespacho(guia.id, linea.id, { accion: 'perdido', cantidad: 2, motivo: 'Se mojaron' }, quien);
    // Recibir las 5 enviadas excede lo pendiente (3).
    await expect(
      confirmarRecepcion(guia.id, { ...recepcion, llegaron: [guia.items[0].id], kitRecibido: [{ lineaId: linea.id, cantidad: 5 }] }, quien)
    ).rejects.toThrow(/quedan 3/);
    const ok = await confirmarRecepcion(
      guia.id,
      { ...recepcion, llegaron: [guia.items[0].id], kitRecibido: [{ lineaId: linea.id, cantidad: 3 }] },
      quien
    );
    expect(ok.estado).toBe('recibida');
    expect(await prisma.dispatchGuideKitItem.findUniqueOrThrow({ where: { id: linea.id } })).toMatchObject({ cantidadRecibida: 3, cantidadPerdida: 2 });
  });
});
