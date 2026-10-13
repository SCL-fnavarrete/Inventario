/** @jest-environment node */
/**
 * Resumen del Dashboard contra Postgres real (SPEC 2.125): el panel de
 * alertas trae solo las mantenciones mas urgentes y cuenta el resto en la
 * base, y el grafico de movimientos cuenta por mes con SQL. Solo corre
 * contra la base de pruebas (ver concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { inicioDeHoy } from '@/shared/utilidades/fechas';
import { ALERTAS_POR_GRUPO, resumenDashboard } from '@/modules/dashboard/resumen';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('resumen del Dashboard en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: { sedeId?: string; categoriaId?: string; tipoId?: string; empleadoId?: string; activos: string[] } = {
    activos: [],
  };
  const dias = (n: number) => {
    const d = inicioDeHoy();
    d.setUTCDate(d.getUTCDate() + n);
    return d;
  };

  beforeAll(async () => {
    const sede = await prisma.sede.create({ data: { codigo: `D${s}`, nombre: `Dash ${s}` } });
    const categoria = await prisma.assetCategory.create({ data: { nombre: `Dash ${s}` } });
    const tipo = await prisma.maintenanceType.create({ data: { nombre: `Dash ${s}` } });
    const empleado = await prisma.employee.create({
      data: { nombres: 'Prueba', apellidoPaterno: s, estado: 'activo', sedeId: sede.id },
    });
    Object.assign(ids, { sedeId: sede.id, categoriaId: categoria.id, tipoId: tipo.id, empleadoId: empleado.id });
    const activo = await prisma.asset.create({
      data: { categoriaId: categoria.id, sedeId: sede.id, marca: 'Dell', modelo: `Dash ${s}`, estado: 'disponible' },
    });
    ids.activos.push(activo.id);
    // 8 vencidas (hace 1 a 8 dias) y 7 proximas (hoy a 6 dias).
    const mantencion = (fechaProgramada: Date) => ({
      assetId: activo.id, tipoId: tipo.id, descripcion: `Dash ${s}`, estado: 'pendiente' as const, fechaProgramada,
    });
    await prisma.maintenance.createMany({
      data: [
        ...Array.from({ length: 8 }, (_, i) => mantencion(dias(-(i + 1)))),
        ...Array.from({ length: 7 }, (_, i) => mantencion(dias(i))),
      ],
    });
    // 3 entregas este mes, una de ellas ya devuelta.
    const ahora = new Date();
    await prisma.assignment.createMany({
      data: [0, 1, 2].map((i) => ({
        assetId: activo.id, employeeId: empleado.id, tipoMovimiento: 'ingreso' as const,
        fechaEntrega: ahora, activo: i !== 0, ...(i === 0 && { fechaDevolucion: ahora }),
      })),
    });
  });

  afterAll(async () => {
    await prisma.maintenance.deleteMany({ where: { assetId: { in: ids.activos } } });
    await prisma.assignment.deleteMany({ where: { assetId: { in: ids.activos } } });
    await prisma.asset.deleteMany({ where: { id: { in: ids.activos } } });
    await prisma.employee.deleteMany({ where: { id: ids.empleadoId } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoriaId } });
    await prisma.maintenanceType.deleteMany({ where: { id: ids.tipoId } });
    await prisma.sede.deleteMany({ where: { id: ids.sedeId } });
    await prisma.$disconnect();
  });

  test('el panel trae solo las más urgentes y cuenta todas', async () => {
    const r = await resumenDashboard(ids.sedeId!);
    expect(r.totalVencidas).toBe(8);
    expect(r.totalProximas).toBe(7);
    expect(r.mantencionesVencidas).toHaveLength(ALERTAS_POR_GRUPO);
    expect(r.mantencionesProximas).toHaveLength(ALERTAS_POR_GRUPO);
    // La vencida más antigua primero; la próxima más cercana primero.
    expect(r.mantencionesVencidas[0].fechaProgramada).toEqual(dias(-8));
    expect(r.mantencionesProximas[0].fechaProgramada).toEqual(dias(0));
    expect(r.pendingMaintenance).toBe(15);
  });

  test('el gráfico cuenta entregas y devoluciones por mes en la base', async () => {
    const r = await resumenDashboard(ids.sedeId!);
    expect(r.asignacionesChartData).toHaveLength(6);
    expect(r.asignacionesChartData[5]).toMatchObject({ asignaciones: 3, devoluciones: 1 });
    expect(r.asignacionesChartData.slice(0, 5).every((m) => m.asignaciones === 0 && m.devoluciones === 0)).toBe(true);
    expect(r.recentAssignments).toBe(3);
  });

  test('otra sede no ve estos datos', async () => {
    const otra = await prisma.sede.create({ data: { codigo: `E${s}`, nombre: `Otra ${s}` } });
    try {
      const r = await resumenDashboard(otra.id);
      expect(r.totalVencidas).toBe(0);
      expect(r.asignacionesChartData.every((m) => m.asignaciones === 0)).toBe(true);
    } finally {
      await prisma.sede.delete({ where: { id: otra.id } });
    }
  });

  test('avisa de las garantías que vencen en los próximos 30 días (solo informativo)', async () => {
    const equipo = (garantia: Date | null, estado: 'disponible' | 'baja' = 'disponible') =>
      prisma.asset.create({
        data: {
          categoriaId: ids.categoriaId!, sedeId: ids.sedeId!, marca: 'HP', modelo: `Gar ${s}`,
          estado, fechaGarantiaFin: garantia,
        },
      });
    const creados = await Promise.all([
      equipo(dias(10)), // entra: faltan 10 dias
      equipo(dias(0)), // entra: vence hoy
      equipo(dias(60)), // no: falta mucho
      equipo(dias(-3)), // no: ya vencio
      equipo(dias(5), 'baja'), // no: esta de baja
      equipo(null), // no: sin garantia
    ]);
    try {
      const r = await resumenDashboard(ids.sedeId!);
      expect(r.totalGarantiasPorVencer).toBe(2);
      // La que vence antes, primero.
      expect(r.garantiasPorVencer.map((g) => g.diasRestantes)).toEqual([0, 10]);
    } finally {
      await prisma.asset.deleteMany({ where: { id: { in: creados.map((c) => c.id) } } });
    }
  });
});
