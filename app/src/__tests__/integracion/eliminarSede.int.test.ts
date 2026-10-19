/** @jest-environment node */
/**
 * Eliminar una sede (SPEC 2.170), contra Postgres real: solo se elimina una
 * sede que nada usa; si la usa algo, se rechaza diciendo que y no se borra
 * nada. Solo corre contra la base de pruebas.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { ConflictError } from '@/shared/errores';
import { eliminarSede } from '@/modules/configuracion/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('eliminar una sede, en Postgres', () => {
  const s = randomUUID().slice(0, 6).toUpperCase();
  const ids: { libre?: string; usada?: string; persona?: string } = {};

  beforeAll(async () => {
    ids.libre = (await prisma.sede.create({ data: { codigo: `L${s}`, nombre: `Libre ${s}` } })).id;
    ids.usada = (await prisma.sede.create({ data: { codigo: `U${s}`, nombre: `Usada ${s}` } })).id;
    ids.persona = (
      await prisma.employee.create({
        data: { nombres: 'Ana', apellidoPaterno: `Sede${s}`, correoPersonal: `ana${s}@x.cl`, sedeId: ids.usada },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { id: ids.persona } });
    await prisma.auditLog.deleteMany({ where: { entidad: 'sede', entidadId: { in: [ids.libre!, ids.usada!] } } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.libre!, ids.usada!] } } });
    await prisma.$disconnect();
  });

  test('una sede que usa una persona no se elimina y el mensaje dice qué la usa', async () => {
    await expect(eliminarSede(ids.usada!, 'admin')).rejects.toThrow(ConflictError);
    await expect(eliminarSede(ids.usada!, 'admin')).rejects.toThrow(/la usan 1 persona/);
    expect(await prisma.sede.findUnique({ where: { id: ids.usada } })).not.toBeNull();
  });

  test('una sede que nada usa se elimina y queda en la auditoría', async () => {
    await eliminarSede(ids.libre!, 'admin');
    expect(await prisma.sede.findUnique({ where: { id: ids.libre } })).toBeNull();
    const registro = await prisma.auditLog.findFirst({ where: { entidad: 'sede', entidadId: ids.libre, accion: 'eliminar' } });
    expect(registro?.descripcion).toContain(`Libre ${s}`);
  });
});
