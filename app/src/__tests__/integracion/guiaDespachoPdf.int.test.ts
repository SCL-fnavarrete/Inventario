/**
 * Guia de despacho en PDF (SPEC 2.145): el documento sale de los datos reales del
 * despacho, en cualquier estado. react-pdf no corre dentro de Jest: se reemplaza
 * por sus datos.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';

jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: async (element: unknown) => element,
  Document: 'Document',
  Page: 'Page',
  Text: 'Text',
  View: 'View',
  StyleSheet: { create: (s: unknown) => s },
}));

import { registrarDespacho, anularDespacho } from '@/modules/despachos/servidor';
import { generateGuiaDespacho } from '@/modules/despachos/documentos';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('guia de despacho en PDF con Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    ids.origen = (await prisma.sede.create({ data: { codigo: `O${s}`, nombre: `Origen ${s}` } })).id;
    ids.destino = (await prisma.sede.create({ data: { codigo: `D${s}`, nombre: `Destino ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cat Guia ${s}`, tipoFicha: 'computador' } })).id;
    ids.equipo = (
      await prisma.asset.create({
        data: { categoriaId: ids.categoria, sedeId: ids.origen, marca: 'Dell', modelo: `Latitude ${s}`, numeroSerie: `SN${s}`, estado: 'disponible' },
      })
    ).id;
  });

  afterAll(async () => {
    const guias = await prisma.dispatchGuide.findMany({ where: { sedeId: ids.origen }, select: { id: true } });
    const idsGuias = guias.map((g) => g.id);
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: idsGuias } } });
    await prisma.dispatchGuideItem.deleteMany({ where: { guideId: { in: idsGuias } } });
    await prisma.dispatchGuide.deleteMany({ where: { id: { in: idsGuias } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: ids.equipo } });
    await prisma.asset.delete({ where: { id: ids.equipo } });
    await prisma.assetCategory.delete({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.origen, ids.destino] } } });
    await prisma.$disconnect();
  });

  type Props = { numero: string; sedeOrigen: string; sedeDestino: string; equipos: { numeroSerie: string; estado: string }[]; anulada: { motivo: string } | null };
  const props = (el: unknown) => (el as { props: Props }).props;

  test('imprime la guia con sus equipos y, anulada, la marca con el motivo', async () => {
    const guia = await registrarDespacho(
      {
        sedeId: ids.origen,
        sedeDestinoId: ids.destino,
        otChilexpress: `OT${s}`,
        fechaDespacho: new Date().toISOString(),
        receptorNombre: 'Receptor Prueba',
        receptorRut: '11.111.111-1',
        assetIds: [ids.equipo],
      },
      { usuario: `tec${s}`, nombre: 'Tecnico Prueba' }
    );

    const enTransito = props((await generateGuiaDespacho(guia.id)).pdf);
    expect(enTransito.numero).toBe(guia.numero);
    expect(enTransito.sedeOrigen).toBe(`Origen ${s}`);
    expect(enTransito.sedeDestino).toBe(`Destino ${s}`);
    expect(enTransito.equipos).toMatchObject([{ numeroSerie: `SN${s}`, estado: 'En tránsito' }]);
    expect(enTransito.anulada).toBeNull();

    await anularDespacho(guia.id, 'Se envió mal', { usuario: `tec${s}` }, async () => undefined);
    const anulada = props((await generateGuiaDespacho(guia.id)).pdf);
    expect(anulada.anulada).toMatchObject({ motivo: 'Se envió mal' });
  });
});
