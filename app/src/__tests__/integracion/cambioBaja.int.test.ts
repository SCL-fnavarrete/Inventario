/** @jest-environment node */
/**
 * Cambio de equipo con el anterior "para dar de baja" (SPEC 2.126), contra
 * Postgres real: en una sola transaccion se cierra la asignacion con su
 * motivo y el equipo queda de baja directo, sin pasar por Mantenciones.
 * Solo corre contra la base de pruebas (ver concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { executeReturn } from '@/modules/asignaciones/ejecucion';
import { crearEquipo } from '@/test-utils/catalogos';

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
    const tipo = await prisma.maintenanceType.create({ data: { nombre: `Baja ${s}` } });
    const activo = await crearEquipo({
        categoriaId: categoria.id, sedeId: sede.id, marca: 'Dell', modelo: `Baja ${s}`,
        estado: 'asignado', empleadoActualId: empleado.id,
      });
    const asignacion = await prisma.assignment.create({
      data: { assetId: activo.id, employeeId: empleado.id, tipoMovimiento: 'ingreso', fechaEntrega: new Date(), activo: true },
    });
    // Una preventiva programada: al darlo de baja se cancela.
    await prisma.maintenance.create({
      data: { assetId: activo.id, tipoId: tipo.id, descripcion: 'Preventiva', estado: 'pendiente', fechaProgramada: new Date() },
    });
    Object.assign(ids, {
      tipo: tipo.id,
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
    await prisma.maintenanceType.deleteMany({ where: { id: ids.tipo } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: ids.sede } });
    await prisma.$disconnect();
  });

  test('queda de baja directo: sin mantención nueva, con el motivo en la devolución', async () => {
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
      motivoBajaId: ids.motivo,
      observacionesDevolucion: `Motivo de baja: Robo ${s} — Denuncia 123`,
    });

    // Ninguna mantencion nueva; la preventiva pendiente quedo cancelada.
    const mantenciones = await prisma.maintenance.findMany({ where: { assetId: ids.activo } });
    expect(mantenciones).toHaveLength(1);
    expect(mantenciones[0]).toMatchObject({ descripcion: 'Preventiva', estado: 'cancelada' });

    const historial = await prisma.assetHistory.findMany({ where: { assetId: ids.activo } });
    expect(historial).toHaveLength(1);
    expect(historial[0]).toMatchObject({
      tipoEvento: 'baja',
      descripcion: `Devuelto por Ana Baja${s} y dado de baja. Motivo: Robo ${s}`,
      usuarioSistema: 'admin.test',
    });

    // El filtro y el conteo por motivo lo encuentran en la devolucion.
    const { whereFiltrosActivos } = await import('@/modules/activos/consultas');
    const conMotivo = await prisma.asset.count({ where: { id: ids.activo, ...whereFiltrosActivos({ datos: { motivoBaja: ids.motivo } }) } });
    expect(conMotivo).toBe(1);
    const { listarMotivosBaja } = await import('@/modules/mantenciones/servidor');
    const uso = (await listarMotivosBaja({ conUso: true })).find((m) => m.id === ids.motivo);
    expect(uso).toMatchObject({ enUso: 1 });
  });

  test('devuelto "Dañado" también se da de baja en el acto: pide el motivo y no abre mantención (SPEC 2.135)', async () => {
    const otro = await crearEquipo({ categoriaId: ids.categoria, sedeId: ids.sede, marca: 'Dell', modelo: `Danado ${s}`, estado: 'asignado', empleadoActualId: ids.empleado });
    const asignacion = await prisma.assignment.create({
      data: { assetId: otro.id, employeeId: ids.empleado, tipoMovimiento: 'ingreso', fechaEntrega: new Date(), activo: true },
    });
    const devolver = (motivoBaja?: { id: string }) =>
      prisma.$transaction((tx) =>
        executeReturn(tx, { assignmentId: asignacion.id, fechaDevolucion: new Date(), recibidoPor: 'Admin', usuarioSistema: 'admin.test', estadoDevolucion: 'danado', motivoBaja })
      );
    try {
      // Sin motivo no se puede: se rechaza y no cambia nada.
      await expect(devolver()).rejects.toMatchObject({ details: [{ field: 'motivoBajaId' }] });
      expect(await prisma.asset.findUniqueOrThrow({ where: { id: otro.id } })).toMatchObject({ estado: 'asignado' });

      await devolver({ id: ids.motivo });
      expect(await prisma.asset.findUniqueOrThrow({ where: { id: otro.id } })).toMatchObject({ estado: 'baja', condicion: 'danado', empleadoActualId: null });
      expect(await prisma.assignment.findUniqueOrThrow({ where: { id: asignacion.id } })).toMatchObject({ estadoDevolucion: 'danado', motivoBajaId: ids.motivo });
      expect(await prisma.maintenance.count({ where: { assetId: otro.id } })).toBe(0);
    } finally {
      await prisma.assetHistory.deleteMany({ where: { assetId: otro.id } });
      await prisma.assignment.deleteMany({ where: { assetId: otro.id } });
      await prisma.asset.delete({ where: { id: otro.id } });
    }
  });
});
