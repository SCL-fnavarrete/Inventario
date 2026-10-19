/** @jest-environment node */
/**
 * Sede de un equipo que llega sin sede (SPEC 2.171), contra Postgres real:
 * - al importar, si la fila no trae sede y el equipo queda con una persona que
 *   tiene sede, toma la suya;
 * - al darle su primera sede a una persona con equipos, sus equipos sin sede
 *   la toman; trasladarla de una sede a otra con equipos sigue bloqueado.
 * Solo corre contra la base de pruebas.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { importarTanda } from '@/modules/importacion/servidor';
import { editarEmpleado } from '@/modules/personas/servidor';
import { updateEmployeeSchema } from '@/modules/personas';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

/** IMEI de 15 digitos con su digito verificador (Luhn). */
const imei = (base14: string) => {
  const suma = [...base14].reverse().reduce((t, c, i) => {
    let d = +c;
    if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    return t + d;
  }, 0);
  return base14 + String((10 - (suma % 10)) % 10);
};
/** RUT chileno valido con puntos y guion a partir de su cuerpo. */
const rut = (cuerpo: number) => {
  let s = 0, m = 2;
  for (const c of [...String(cuerpo)].reverse()) { s += +c * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (s % 11);
  const dv = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return `${String(cuerpo).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};
const letras = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const nuevoImei = (i: number) => imei(`35${Math.floor(Math.random() * 1e11).toString().padStart(11, '0')}${i}`.slice(0, 14));

describir('sede de un equipo que llega sin sede, en Postgres', () => {
  const s = randomUUID().slice(0, 6).toUpperCase();
  const apellido = `Zs${letras(8)}`;
  const base = 80_000_000 + Math.floor(Math.random() * 9_000_000);
  const ruts = { conSede: rut(base), sinSede: rut(base + 1) };
  const sesion = { user: { id: 'u-test', usuario: 'qa-sede', role: 'admin', sedeId: null } } as never;
  const ids: { sede?: string; otra?: string; categoria?: string; marca?: string } = {};
  const imeis = [nuevoImei(1), nuevoImei(2)];
  const fila = (extra: Record<string, string>) => ({ marca: `Ms${s}`, modelo: 'Moto G54', fechaEntrega: '15-02-2024', estado: 'Asignado', ...extra });
  const importar = (data: Record<string, string>) =>
    importarTanda({ categoria: `Cel ${s}`, rows: [{ rowIndex: 0, data: fila(data) }] }, sesion);

  beforeAll(async () => {
    ids.sede = (await prisma.sede.create({ data: { codigo: `A${s}`, nombre: `Sede A ${s}` } })).id;
    ids.otra = (await prisma.sede.create({ data: { codigo: `B${s}`, nombre: `Sede B ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cel ${s}`, tipoFicha: 'celular' } })).id;
    ids.marca = (await prisma.marca.create({ data: { nombre: `Ms${s}` } })).id;
    await prisma.employee.create({ data: { rut: ruts.conSede, nombres: 'Ana', apellidoPaterno: `${apellido}Con`, estado: 'activo', sedeId: ids.sede } });
  });

  afterAll(async () => {
    const empleados = await prisma.employee.findMany({ where: { apellidoPaterno: { startsWith: apellido } }, select: { id: true } });
    const activos = (await prisma.asset.findMany({ where: { imei: { in: imeis } }, select: { id: true } })).map((a) => a.id);
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: empleados.map((e) => e.id) } } });
    await prisma.assignment.deleteMany({ where: { assetId: { in: activos } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: activos } } });
    await prisma.asset.deleteMany({ where: { id: { in: activos } } });
    await prisma.employee.deleteMany({ where: { id: { in: empleados.map((e) => e.id) } } });
    await prisma.marca.deleteMany({ where: { id: ids.marca } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: { in: [ids.sede!, ids.otra!] } } });
    await prisma.$disconnect();
  });

  test('importar sin sede: el celular toma la sede de la persona que lo tiene', async () => {
    const r = await importar({ imei: imeis[0], rut: ruts.conSede, nombre: 'Ana', apellidoP: `${apellido}Con` });
    expect(r.results[0].errors).toEqual([]);
    expect((await prisma.asset.findFirstOrThrow({ where: { imei: imeis[0] } })).sedeId).toBe(ids.sede);
  });

  test('la primera sede de una persona la toman sus equipos sin sede; luego no se traslada con equipos', async () => {
    // Persona nueva sin sede: el celular y ella quedan sin sede, como los celulares importados.
    await importar({ imei: imeis[1], rut: ruts.sinSede, nombre: 'Beto', apellidoP: `${apellido}Sin` });
    const celular = await prisma.asset.findFirstOrThrow({ where: { imei: imeis[1] } });
    const persona = await prisma.employee.findUniqueOrThrow({ where: { rut: ruts.sinSede } });
    expect(celular.sedeId).toBeNull();
    expect(persona.sedeId).toBeNull();

    await editarEmpleado(persona.id, updateEmployeeSchema.parse({ sedeId: ids.otra }), 'qa-sede');
    expect((await prisma.asset.findUniqueOrThrow({ where: { id: celular.id } })).sedeId).toBe(ids.otra);
    const evento = await prisma.assetHistory.findFirst({ where: { assetId: celular.id, descripcion: { contains: 'la de su persona' } } });
    expect(evento).not.toBeNull();

    // Ya tiene sede y un equipo: trasladarla sigue bloqueado (SPEC 2.117).
    await expect(editarEmpleado(persona.id, updateEmployeeSchema.parse({ sedeId: ids.sede }), 'qa-sede')).rejects.toThrow(/equipo/);
  });
});
