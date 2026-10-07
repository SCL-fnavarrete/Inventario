/** @jest-environment node */
/**
 * Equipo sin sede (SPEC 2.117), contra Postgres real: uno importado sin sede la
 * recibe al editarlo, una sola vez y con su evento en el historial; despues la
 * sede cambia solo con una Guia de Despacho. Solo corre contra la base de pruebas.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { editarActivo } from '@/modules/activos/servidor';
import { resumenDashboard } from '@/modules/dashboard/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('sede de un equipo importado sin sede, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: { sedeA?: string; sedeB?: string; categoria?: string; activo?: string } = {};

  beforeAll(async () => {
    ids.sedeA = (await prisma.sede.create({ data: { codigo: `A${s}`, nombre: `Sede A ${s}` } })).id;
    ids.sedeB = (await prisma.sede.create({ data: { codigo: `B${s}`, nombre: `Sede B ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Mon ${s}` } })).id;
    ids.activo = (await prisma.asset.create({ data: { categoriaId: ids.categoria, marca: 'Dell', modelo: 'P2422', numeroSerie: `SS-${s}`, estado: 'disponible' } })).id;
  });

  afterAll(async () => {
    await prisma.assetHistory.deleteMany({ where: { assetId: ids.activo } });
    await prisma.asset.deleteMany({ where: { id: ids.activo } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.sedeA!, ids.sedeB!] } } });
    await prisma.$disconnect();
  });

  test('sin sede: el dashboard lo avisa, con cualquier sede en el navbar', async () => {
    expect((await resumenDashboard(null)).equiposSinSede).toBeGreaterThanOrEqual(1);
    expect((await resumenDashboard(ids.sedeB!)).equiposSinSede).toBeGreaterThanOrEqual(1);
  });

  test('sin sede: al editar se le asigna y queda en el historial', async () => {
    const antes = (await resumenDashboard(null)).equiposSinSede;
    await editarActivo(ids.activo!, { sedeId: ids.sedeA }, 'qa-sede');
    const activo = await prisma.asset.findUnique({ where: { id: ids.activo } });
    expect(activo?.sedeId).toBe(ids.sedeA);
    const eventos = await prisma.assetHistory.findMany({ where: { assetId: ids.activo } });
    expect(eventos.map((e) => e.descripcion)).toEqual([`Sede asignada: Sede A ${s} (el equipo no tenía sede)`]);
    expect((await resumenDashboard(null)).equiposSinSede).toBe(antes - 1);
  });

  test('con sede: editar no la cambia (va por Guía de Despacho)', async () => {
    await expect(editarActivo(ids.activo!, { sedeId: ids.sedeB }, 'qa-sede')).rejects.toThrow(/Guía de Despacho/);
    // Mandar la misma sede no es un cambio.
    await expect(editarActivo(ids.activo!, { sedeId: ids.sedeA, modelo: 'P2423' }, 'qa-sede')).resolves.toMatchObject({ sedeId: ids.sedeA, modelo: 'P2423' });
  });
});
