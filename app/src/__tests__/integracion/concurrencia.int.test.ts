/** @jest-environment node */
/**
 * Concurrencia contra Postgres real (auditoria 27-sep-2026, 2.10).
 *
 * Los tests unitarios simulan la base, asi que no pueden probar que dos
 * operaciones simultaneas sobre el mismo registro terminen con UNA ganadora.
 * Estos si: lanzan las dos a la vez, cada una en su transaccion, y revisan
 * que una gane y la otra reciba 409.
 *
 * Escriben y borran datos, por eso solo corren contra una base de pruebas:
 * DATABASE_URL tiene que contener "_test". En desarrollo y en el CI se saltan.
 *
 *   docker exec -it inventario_postgres createdb -U inventario inventario_it_test   (una vez)
 *   npm run db:test:migrate     (aplica las migraciones a la base de pruebas)
 *   npm run test:integracion    (corre estos tests contra ella)
 * Ambos usan scripts/con-base-test.mjs, que cambia la base de .env por
 * inventario_it_test y se niega a correr contra cualquier otra.
 */
// Las rutas se llaman de verdad; solo el permiso se simula (un admin).
jest.mock('@/shared/auth/guard', () => {
  const real = jest.requireActual('@/shared/auth/guard');
  return {
    ...real,
    requirePermission: jest.fn().mockResolvedValue({
      user: { id: 'admin-test', email: 'admin@test.cl', name: 'Admin', role: 'admin', sedeId: null },
    }),
  };
});

import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import { prisma } from '@/shared/prisma';
import { executeAssignment, executeReturn } from '@/modules/asignaciones/ejecucion';
import { executeKitDelivery } from '@/modules/solicitudes/ejecucion';
import { POST as vender } from '@/app/api/activos/[id]/venta/route';
import { POST as darDeBaja } from '@/app/api/mantenciones/baja/route';
import { POST as completar } from '@/app/api/mantenciones/[id]/completar/route';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('concurrencia real en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: {
    sedeId?: string;
    categoriaId?: string;
    empleadoId?: string;
    usuarioId?: string;
    solicitudId?: string;
    activos: string[];
    itemId?: string;
    tipoId?: string;
  } = { activos: [] };

  const nuevoActivo = async () => {
    const a = await prisma.asset.create({
      data: { categoriaId: ids.categoriaId!, sedeId: ids.sedeId!, marca: 'Dell', modelo: `Test ${s}`, estado: 'disponible' },
    });
    ids.activos.push(a.id);
    return a.id;
  };

  const entregar = (assetId: string) =>
    prisma.$transaction((tx) =>
      executeAssignment(tx, {
        assetId,
        employeeId: ids.empleadoId!,
        fechaEntrega: new Date(),
        tipoMovimiento: 'ingreso',
        sedeId: ids.sedeId!,
      })
    );

  /** POST a una ruta real; devuelve el codigo HTTP. */
  const post = async <P extends Record<string, string>>(
    handler: (req: NextRequest, ctx: { params: Promise<P> }) => Promise<Response>,
    body: unknown,
    params = {} as P
  ) => {
    const req = new NextRequest('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });
    return (await handler(req, { params: Promise.resolve(params) })).status;
  };

  /** Por HTTP: una responde 200 o 201 y la otra 409. */
  const unaGanaOtra409 = (codigos: number[]) => {
    expect(codigos.filter((c) => c === 200 || c === 201)).toHaveLength(1);
    expect(codigos.filter((c) => c === 409)).toHaveLength(1);
  };

  /** Una gana y la otra recibe 409 (ConflictError). */
  const unaGanaOtraConflicto = (resultados: PromiseSettledResult<unknown>[]) => {
    const ganadoras = resultados.filter((r) => r.status === 'fulfilled');
    const perdedoras = resultados.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ganadoras).toHaveLength(1);
    expect(perdedoras).toHaveLength(1);
    expect(perdedoras[0].reason).toMatchObject({ status: 409 });
  };

  beforeAll(async () => {
    const sede = await prisma.sede.create({ data: { codigo: `T${s}`, nombre: `Test ${s}` } });
    const categoria = await prisma.assetCategory.create({ data: { nombre: `Test ${s}` } });
    const tipo = await prisma.maintenanceType.create({ data: { nombre: `Test ${s}` } });
    const empleado = await prisma.employee.create({
      data: { nombres: 'Prueba', apellidoPaterno: s, estado: 'activo', sedeId: sede.id },
    });
    const usuario = await prisma.systemUser.create({
      data: { email: `t${s}@test.cl`, passwordHash: 'x', nombre: 'Test', rol: 'admin' },
    });
    const solicitud = await prisma.workflowRequest.create({
      data: {
        numero: `WF-TEST-${s}`,
        tipo: 'onboarding',
        estado: 'solicitud_recibida',
        employeeId: empleado.id,
        solicitanteId: usuario.id,
        sedeId: sede.id,
      },
    });
    Object.assign(ids, {
      sedeId: sede.id,
      categoriaId: categoria.id,
      empleadoId: empleado.id,
      usuarioId: usuario.id,
      solicitudId: solicitud.id,
      tipoId: tipo.id,
    });
  });

  afterAll(async () => {
    // Del registro mas dependiente al menos dependiente.
    await prisma.kitAssignment.deleteMany({ where: { employeeId: ids.empleadoId } });
    await prisma.requestKitItem.deleteMany({ where: { requestId: ids.solicitudId } });
    await prisma.welcomeKitItem.deleteMany({ where: { sedeId: ids.sedeId } });
    await prisma.maintenance.deleteMany({ where: { assetId: { in: ids.activos } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: ids.activos } } });
    await prisma.assignment.deleteMany({ where: { assetId: { in: ids.activos } } });
    await prisma.asset.deleteMany({ where: { id: { in: ids.activos } } });
    await prisma.workflowRequest.deleteMany({ where: { id: ids.solicitudId } });
    await prisma.systemUser.deleteMany({ where: { id: ids.usuarioId } });
    await prisma.employee.deleteMany({ where: { id: ids.empleadoId } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoriaId } });
    await prisma.maintenanceType.deleteMany({ where: { id: ids.tipoId } });
    await prisma.sede.deleteMany({ where: { id: ids.sedeId } });
    await prisma.$disconnect();
  });

  test('dos entregas del mismo equipo a la vez: una sola asignacion', async () => {
    const assetId = await nuevoActivo();
    unaGanaOtraConflicto(await Promise.allSettled([entregar(assetId), entregar(assetId)]));
    expect(await prisma.assignment.count({ where: { assetId, activo: true } })).toBe(1);
  });

  test('dos devoluciones de la misma asignacion a la vez: se cierra una vez', async () => {
    const assetId = await nuevoActivo();
    const asignacion = await entregar(assetId);
    const devolver = () =>
      prisma.$transaction((tx) =>
        executeReturn(tx, {
          assignmentId: (asignacion as { id: string }).id,
          fechaDevolucion: new Date(),
          estadoDevolucion: 'ok',
        })
      );
    unaGanaOtraConflicto(await Promise.allSettled([devolver(), devolver()]));
    expect((await prisma.asset.findUnique({ where: { id: assetId } }))?.estado).toBe('disponible');
  });

  test('dos entregas de Kit con stock para una sola: el stock no queda negativo', async () => {
    const item = await prisma.welcomeKitItem.create({
      data: { nombre: `Casco ${s}`, categoria: 'epp', cantidad: 1, sedeId: ids.sedeId },
    });
    const entregarKit = () =>
      prisma.$transaction((tx) =>
        executeKitDelivery(tx, {
          itemId: item.id,
          cantidad: 1,
          employeeId: ids.empleadoId!,
          requestId: ids.solicitudId!,
          sedeId: ids.sedeId!,
        })
      );
    unaGanaOtraConflicto(await Promise.allSettled([entregarKit(), entregarKit()]));
    expect((await prisma.welcomeKitItem.findUnique({ where: { id: item.id } }))?.cantidad).toBe(0);
  });

  // Auditoria 28-sep-2026 (7.A-1): venta, baja y mantenciones.
  test('dos ventas del mismo equipo a la vez: se registra una sola', async () => {
    const assetId = await nuevoActivo();
    await prisma.asset.update({ where: { id: assetId }, data: { estado: 'baja' } });
    const venta = { comprador: 'Juan', monto: 1000, moneda: 'CLP', fechaVenta: '2026-09-28' };
    unaGanaOtra409(await Promise.all([post(vender, venta, { id: assetId }), post(vender, venta, { id: assetId })]));
    expect(await prisma.assetHistory.count({ where: { assetId, tipoEvento: 'venta' } })).toBe(1);
  });

  test('dos bajas del mismo equipo a la vez: queda una sola mantención de baja', async () => {
    const assetId = await nuevoActivo();
    // Motivo de la lista que carga la migracion (SPEC 2.116.5).
    const motivo = await prisma.motivoBaja.findUniqueOrThrow({ where: { nombre: 'Obsolescencia' } });
    const baja = {
      assetId, tipoId: ids.tipoId, motivoBajaId: motivo.id, fechaRealizada: '2026-09-28', realizadoPor: 'Técnico',
    };
    unaGanaOtra409(await Promise.all([post(darDeBaja, baja), post(darDeBaja, baja)]));
    expect(await prisma.maintenance.count({ where: { assetId, resultadoTipo: 'no_reparable', motivoBajaId: motivo.id } })).toBe(1);
  });

  test('completar la misma mantención dos veces a la vez: se completa una vez', async () => {
    const assetId = await nuevoActivo();
    await prisma.asset.update({ where: { id: assetId }, data: { estado: 'en_mantencion' } });
    const m = await prisma.maintenance.create({
      data: { assetId, tipoId: ids.tipoId!, descripcion: 'Prueba', fechaProgramada: new Date(), estado: 'en_proceso' },
    });
    const cierre = { fechaRealizada: '2026-09-28', realizadoPor: 'Técnico', resultado: 'Ok', resultadoTipo: 'reparado' };
    unaGanaOtra409(await Promise.all([post(completar, cierre, { id: m.id }), post(completar, cierre, { id: m.id })]));
    expect((await prisma.asset.findUnique({ where: { id: assetId } }))?.estado).toBe('disponible');
  });
});
