/** @jest-environment node */
/**
 * Baja directa de un equipo (SPEC 2.140), contra Postgres real: pasa a Baja con su
 * motivo y su fecha, sin crear una mantencion; sus mantenciones abiertas se
 * cancelan. Solo corre contra la base de pruebas (ver concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { bajaEquipoSchema } from '@/modules/mantenciones';
import { whereFiltrosActivos } from '@/modules/activos/consultas';
import { darDeBajaEquipo, listarMotivosBaja } from '@/modules/mantenciones/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('baja directa de un equipo, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};
  const activos: string[] = [];

  const nuevoEquipo = async (extra: object = {}) => {
    const a = await prisma.asset.create({
      data: { categoriaId: ids.categoria, sedeId: ids.sede, marca: 'Dell', modelo: `Baja ${s}`, estado: 'disponible', ...extra },
    });
    activos.push(a.id);
    return a.id;
  };
  const baja = (datos: object = {}) => bajaEquipoSchema.parse({ motivoBajaId: ids.motivo, fechaBaja: '2026-10-01', ...datos });

  beforeAll(async () => {
    // Con sede propia: los equipos sin sede los cuenta otra prueba (sedeAlEditar).
    ids.sede = (await prisma.sede.create({ data: { codigo: `B${s}`, nombre: `Baja ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Baja ${s}` } })).id;
    ids.tipo = (await prisma.maintenanceType.create({ data: { nombre: `Tipo ${s}` } })).id;
    ids.motivo = (await prisma.motivoBaja.findUniqueOrThrow({ where: { nombre: 'Obsolescencia' } })).id;
    ids.otro = (await prisma.motivoBaja.findUniqueOrThrow({ where: { clave: 'otro' } })).id;
    ids.empleado = (await prisma.employee.create({ data: { nombres: 'Ana', apellidoPaterno: `Baja${s}`, estado: 'activo' } })).id;
  });

  afterAll(async () => {
    await prisma.maintenance.deleteMany({ where: { assetId: { in: activos } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: activos } } });
    await prisma.asset.deleteMany({ where: { id: { in: activos } } });
    await prisma.employee.deleteMany({ where: { id: ids.empleado } });
    await prisma.maintenanceType.deleteMany({ where: { id: ids.tipo } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: ids.sede } });
    await prisma.$disconnect();
  });

  test('pasa a Baja con su motivo y su fecha, queda en el historial y no crea una mantención', async () => {
    const id = await nuevoEquipo();
    await darDeBajaEquipo(id, baja({ observaciones: 'No enciende' }), 'jsoto');
    const equipo = await prisma.asset.findUniqueOrThrow({ where: { id } });
    expect(equipo).toMatchObject({ estado: 'baja', motivoBajaId: ids.motivo, motivoBaja: 'Obsolescencia' });
    expect(equipo.fechaBaja?.toISOString().slice(0, 10)).toBe('2026-10-01');
    const eventos = await prisma.assetHistory.findMany({ where: { assetId: id, tipoEvento: 'baja' } });
    expect(eventos).toHaveLength(1);
    expect(eventos[0].descripcion).toContain('Obsolescencia');
    expect(eventos[0].descripcion).toContain('No enciende');
    expect(await prisma.maintenance.count({ where: { assetId: id } })).toBe(0);
  });

  test('sus mantenciones abiertas se cancelan', async () => {
    const id = await nuevoEquipo();
    const m = await prisma.maintenance.create({
      data: { assetId: id, tipoId: ids.tipo, descripcion: 'Revisión', fechaProgramada: new Date(), estado: 'pendiente' },
    });
    await darDeBajaEquipo(id, baja(), 'jsoto');
    expect(await prisma.maintenance.findUniqueOrThrow({ where: { id: m.id } })).toMatchObject({ estado: 'cancelada' });
    expect(await prisma.maintenance.count({ where: { assetId: id } })).toBe(1);
  });

  test('"Otro" pide el detalle y queda en el texto del motivo', async () => {
    const id = await nuevoEquipo();
    await expect(darDeBajaEquipo(id, baja({ motivoBajaId: ids.otro }), 'jsoto')).rejects.toMatchObject({
      details: [{ field: 'motivoDetalle' }],
    });
    await darDeBajaEquipo(id, baja({ motivoBajaId: ids.otro, motivoDetalle: 'Se cayó al río' }), 'jsoto');
    expect((await prisma.asset.findUniqueOrThrow({ where: { id } })).motivoBaja).toBe('Otro: Se cayó al río');
  });

  test('un equipo asignado, uno ya dado de baja o uno descartado se rechazan', async () => {
    const asignado = await nuevoEquipo({ estado: 'asignado', empleadoActualId: ids.empleado });
    await expect(darDeBajaEquipo(asignado, baja(), 'jsoto')).rejects.toMatchObject({ status: 409 });
    const yaDeBaja = await nuevoEquipo({ estado: 'baja' });
    await expect(darDeBajaEquipo(yaDeBaja, baja(), 'jsoto')).rejects.toMatchObject({ status: 409 });
    const descartado = await nuevoEquipo({ deletedAt: new Date() });
    await expect(darDeBajaEquipo(descartado, baja(), 'jsoto')).rejects.toMatchObject({ status: 409 });
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: asignado } })).estado).toBe('asignado');
  });

  test('la lista de motivos cuenta las bajas por equipo', async () => {
    const id = await nuevoEquipo();
    const enUso = async () => ((await listarMotivosBaja({ conUso: true })).find((m) => m.id === ids.motivo) as { enUso?: number } | undefined)?.enUso ?? 0;
    const antes = await enUso();
    await darDeBajaEquipo(id, baja(), 'jsoto');
    expect((await enUso()) - antes).toBe(1);
  });

  test('el filtro de Activos "motivo de baja" encuentra una baja directa', async () => {
    const id = await nuevoEquipo();
    await darDeBajaEquipo(id, baja(), 'jsoto');
    const buscar = (motivo: string) =>
      prisma.asset.findMany({ where: { id, ...whereFiltrosActivos({ datos: { motivoBaja: motivo } }) }, select: { id: true } });
    expect(await buscar(ids.motivo)).toHaveLength(1);
    expect(await buscar(ids.otro)).toHaveLength(0);
    expect(await buscar('sin_dato')).toHaveLength(0);
  });
});
