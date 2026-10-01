/** @jest-environment node */
/**
 * Una sola sesion por usuario (SPEC 2.127), contra Postgres real: fijar la
 * sesion vigente devuelve la que estaba antes, y dos inicios de sesion a la
 * vez dejan una sola vigente. Solo corre contra la base de pruebas (ver
 * concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { fijarSesionVigente } from '@/shared/auth/cuentas';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('sesion vigente en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  let id = '';

  beforeAll(async () => {
    id = (await prisma.systemUser.create({ data: { usuario: `ses.${s}`, passwordHash: 'x', nombre: 'Prueba', rol: 'tecnico' } })).id;
  });
  afterAll(async () => {
    await prisma.systemUser.deleteMany({ where: { id } });
    await prisma.$disconnect();
  });

  test('devuelve la sesion que estaba vigente y deja la nueva', async () => {
    expect(await fijarSesionVigente(id, 'a')).toBeNull();
    expect(await fijarSesionVigente(id, 'b')).toBe('a');
    expect(await fijarSesionVigente(id, null)).toBe('b');
    expect((await prisma.systemUser.findUniqueOrThrow({ where: { id } })).sesionVigenteId).toBeNull();
  });

  test('dos inicios de sesion a la vez: queda una sola vigente y cada uno ve a quien reemplazo', async () => {
    await fijarSesionVigente(id, 'x');
    const [primero, segundo] = await Promise.all([fijarSesionVigente(id, 'y'), fijarSesionVigente(id, 'z')]);
    const vigente = (await prisma.systemUser.findUniqueOrThrow({ where: { id } })).sesionVigenteId;
    // Uno reemplazo a "x" y el otro al primero: nunca los dos a "x".
    expect([primero, segundo].sort()).toEqual(vigente === 'z' ? ['x', 'y'] : ['x', 'z']);
  });
});
