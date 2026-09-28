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
 *   docker exec -it inventario_postgres createdb -U inventario inventario_it_test
 *   DATABASE_URL=".../inventario_it_test" DATABASE_URL_UNPOOLED=".../inventario_it_test" npx prisma migrate deploy
 *   DATABASE_URL=".../inventario_it_test" npx jest concurrencia.int
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  executeAssignment,
  executeKitDelivery,
  executeReturn,
} from '@/lib/services/workflowExecutionService';

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
    });
  });

  afterAll(async () => {
    // Del registro mas dependiente al menos dependiente.
    await prisma.kitAssignment.deleteMany({ where: { employeeId: ids.empleadoId } });
    await prisma.requestKitItem.deleteMany({ where: { requestId: ids.solicitudId } });
    await prisma.welcomeKitItem.deleteMany({ where: { sedeId: ids.sedeId } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: ids.activos } } });
    await prisma.assignment.deleteMany({ where: { assetId: { in: ids.activos } } });
    await prisma.asset.deleteMany({ where: { id: { in: ids.activos } } });
    await prisma.workflowRequest.deleteMany({ where: { id: ids.solicitudId } });
    await prisma.systemUser.deleteMany({ where: { id: ids.usuarioId } });
    await prisma.employee.deleteMany({ where: { id: ids.empleadoId } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoriaId } });
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
});
