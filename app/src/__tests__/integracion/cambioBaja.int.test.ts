/** @jest-environment node */
/**
 * Cambio de equipo con el anterior "para dar de baja" (SPEC 2.126), contra
 * Postgres real: en una sola transaccion se cierra la asignacion y el equipo
 * queda de baja con su mantencion "No reparable" ya cerrada y su motivo.
 * Solo corre contra la base de pruebas (ver concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { executeReturn } from '@/modules/asignaciones/ejecucion';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('devolver para dar de baja, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    const sede = await prisma.sede.create({ data: { codigo: `K${s}`, nombre: `Baja ${s}` } });
    const categoria = await prisma.assetCategory.create({ data: { nombre: `Baja ${s}` } });
    const empleado = await prisma.employee.create({
      data: { nombres: 'Ana', apellidoPaterno: `Baja${s}`, estado: 'activo', sedeId: sede.id },
    });
    const motivo = await prisma.motivoBaja.create({ data: { nombre: `Robo ${s}` } });
    const activo = await prisma.asset.create({
      data: {
        categoriaId: categoria.id, sedeId: sede.id, marca: 'Dell', modelo: `Baja ${s}`,
        estado: 'asignado', empleadoActualId: empleado.id,
      },
    });
    const asignacion = await prisma.assignment.create({
      data: { assetId: activo.id, employeeId: empleado.id, tipoMovimiento: 'ingreso', fechaEntrega: new Date(), activo: true },
    });
    Object.assign(ids, {
      sede: sede.id, categoria: categoria.id, empleado: empleado.id, motivo: motivo.id,
      activo: activo.id, asignacion: asignacion.id,
    });
  });

  afterAll(async () => {
    const mantenciones = await prisma.maintenance.findMany({ where: { assetId: ids.activo }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: mantenciones.map((m) => m.id) } } });
    await prisma.maintenance.deleteMany({ where: { assetId: ids.activo } });
    await prisma.assetHistory.deleteMany({ where: { assetId: ids.activo } });
    await prisma.assignment.deleteMany({ where: { assetId: ids.activo } });
    await prisma.asset.deleteMany({ where: { id: ids.activo } });
    await prisma.employee.deleteMany({ where: { id: ids.empleado } });
    await prisma.motivoBaja.deleteMany({ where: { id: ids.motivo } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: ids.sede } });
    await prisma.$disconnect();
  });

  test('queda de baja en el acto, con su mantención No reparable cerrada y el motivo', async () => {
    await prisma.$transaction((tx) =>
      executeReturn(tx, {
        assignmentId: ids.asignacion,
        fechaDevolucion: new Date(),
        recibidoPor: 'Admin',
        usuarioSistema: 'admin.test',
        estadoDevolucion: 'baja',
        motivoBaja: { id: ids.motivo },
        observacionesDevolucion: 'Denuncia 123',
        contexto: 'cambio',
      })
    );

    const activo = await prisma.asset.findUniqueOrThrow({ where: { id: ids.activo } });
    expect(activo).toMatchObject({ estado: 'baja', empleadoActualId: null });
    expect(activo.fechaBaja).not.toBeNull();

    const asignacion = await prisma.assignment.findUniqueOrThrow({ where: { id: ids.asignacion } });
    expect(asignacion).toMatchObject({
      activo: false,
      estadoDevolucion: 'baja',
      observacionesDevolucion: `Motivo de baja: Robo ${s} — Denuncia 123`,
    });

    const mantenciones = await prisma.maintenance.findMany({ where: { assetId: ids.activo } });
    expect(mantenciones).toHaveLength(1);
    expect(mantenciones[0]).toMatchObject({
      estado: 'completada',
      resultadoTipo: 'no_reparable',
      motivoBajaId: ids.motivo,
      motivoBaja: `Robo ${s}`,
    });

    const historial = await prisma.assetHistory.findMany({ where: { assetId: ids.activo }, orderBy: { createdAt: 'asc' } });
    expect(historial.map((h) => h.tipoEvento)).toEqual(['devolucion', 'baja']);
    expect(historial[0].descripcion).toBe(`Devuelto por Ana Baja${s} para dar de baja. Motivo: Robo ${s}`);
    expect(historial.every((h) => h.usuarioSistema === 'admin.test')).toBe(true);
  });
});
