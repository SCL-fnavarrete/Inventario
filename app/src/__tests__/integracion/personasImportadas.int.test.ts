/** @jest-environment node */
/**
 * Personas que crea la importacion de Activos (SPEC 2.133), contra Postgres
 * real: se crean siempre que la fila las traiga, con el estado que corresponde
 * (activa si el equipo queda con ella, desvinculada si no), sin duplicarlas y sin
 * inventar correos. Solo corre contra la base de pruebas (ver concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import { importarTanda } from '@/modules/importacion/servidor';

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
/** Letras al azar: los nombres se comparan sin digitos. */
const letras = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');

describir('personas de la importacion de activos, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const apellido = `Zz${letras(8)}`;
  const base = 90_000_000 + Math.floor(Math.random() * 9_000_000);
  const ruts = { asignada: rut(base), mantencion: rut(base + 1), libre: rut(base + 2), noDevuelto: rut(base + 3) };
  const sesion = { user: { id: 'u-test', usuario: 'qa-importacion', role: 'admin', sedeId: null } } as never;
  const ids: { sede?: string; categoria?: string; marca?: string; sinRut?: string } = {};
  const imeis = Array.from({ length: 6 }, (_, i) => imei(`35${Math.floor(Math.random() * 1e11).toString().padStart(11, '0')}${i}`.slice(0, 14)));

  const fila = (extra: Record<string, string>) => ({ marca: `Mc${s}`, modelo: 'Moto G54', fechaEntrega: '15-02-2024', ...extra });

  beforeAll(async () => {
    ids.sede = (await prisma.sede.create({ data: { codigo: `I${s}`, nombre: `Import ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cel ${s}`, tipoFicha: 'celular' } })).id;
    ids.marca = (await prisma.marca.create({ data: { nombre: `Mc${s}` } })).id;
    // Una persona creada antes sin RUT (como Felipe Muñoz del inventario de notebooks).
    ids.sinRut = (await prisma.employee.create({ data: { nombres: 'Felipe Alejandro', apellidoPaterno: `${apellido}Sinrut`, apellidoMaterno: 'Suarez', estado: 'activo', sedeId: ids.sede } })).id;
  });

  afterAll(async () => {
    const empleados = await prisma.employee.findMany({ where: { OR: [{ apellidoPaterno: { startsWith: apellido } }, { rut: { in: Object.values(ruts) } }] }, select: { id: true } });
    const activos = await prisma.asset.findMany({ where: { imei: { in: imeis } }, select: { id: true } });
    const idsActivos = activos.map((a) => a.id);
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: empleados.map((e) => e.id) } } });
    await prisma.maintenance.deleteMany({ where: { assetId: { in: idsActivos } } });
    await prisma.assignment.deleteMany({ where: { assetId: { in: idsActivos } } });
    await prisma.assetHistory.deleteMany({ where: { assetId: { in: idsActivos } } });
    await prisma.asset.deleteMany({ where: { id: { in: idsActivos } } });
    await prisma.employee.deleteMany({ where: { id: { in: empleados.map((e) => e.id) } } });
    await prisma.marca.deleteMany({ where: { id: ids.marca } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: ids.sede } });
    await prisma.$disconnect();
  });

  test('crea a cada persona con el estado que corresponde al equipo, sin duplicarla ni inventar correos', async () => {
    const filas = [
      // Asignado: persona activa, con sus datos.
      fila({ imei: imeis[0], estado: 'Asignado', rut: ruts.asignada, nombre: 'Ana María', apellidoP: apellido, apellidoM: 'Soto', cargo: 'Analista', correoEmpresa: `ana.${s}@sclconsultores.com` }),
      // En mantención: la persona se crea activa y el equipo sigue a su nombre.
      fila({ imei: imeis[1], estado: 'Mantención', rut: ruts.mantencion, nombre: 'Bruno', apellidoP: `${apellido}Mant` }),
      // "Disponible" con una persona: el equipo es suyo (SPEC 2.133): Asignado, con su entrega, y ella activa.
      fila({ imei: imeis[2], estado: 'Disponible', rut: ruts.libre, nombre: 'Carla', apellidoP: `${apellido}Libre` }),
      // No devuelto: persona desvinculada y el equipo sigue a su nombre.
      fila({ imei: imeis[3], estado: 'No devuelto', rut: ruts.noDevuelto, nombre: 'Diego', apellidoP: `${apellido}Nodev` }),
      // Sin RUT: se encuentra por nombre y apellidos.
      fila({ imei: imeis[4], estado: 'Asignado', nombre: 'Felipe Alejandro', apellidoP: `${apellido}Sinrut`, apellidoM: 'Suarez' }),
      // La misma persona de la primera fila con otro equipo: no se duplica.
      fila({ imei: imeis[5], estado: 'Asignado', rut: ruts.asignada, nombre: 'Ana María', apellidoP: apellido, apellidoM: 'Soto' }),
    ];
    const r = await importarTanda({ categoria: `Cel ${s}`, sedeId: ids.sede, rows: filas.map((data, rowIndex) => ({ rowIndex, data })) }, sesion);
    expect(r.results.map((x) => x.errors[0]?.message ?? x.status)).toEqual(Array(6).fill('imported'));

    const persona = (rutOApellido: string) =>
      prisma.employee.findFirstOrThrow({ where: { OR: [{ rut: rutOApellido }, { apellidoPaterno: rutOApellido }] } });
    const activo = (n: number) => prisma.asset.findUniqueOrThrow({ where: { imei: imeis[n] } });

    const ana = await persona(ruts.asignada);
    expect(ana).toMatchObject({ estado: 'activo', cargo: 'Analista', correoEmpresa: `ana.${s}@sclconsultores.com`, sedeId: ids.sede });
    expect(await prisma.employee.count({ where: { rut: ruts.asignada } })).toBe(1);
    expect(await activo(0)).toMatchObject({ estado: 'asignado', empleadoActualId: ana.id });
    expect(await activo(5)).toMatchObject({ estado: 'asignado', empleadoActualId: ana.id });

    const bruno = await persona(ruts.mantencion);
    expect(bruno).toMatchObject({ estado: 'activo', correoEmpresa: null, correoPersonal: null });
    expect(await activo(1)).toMatchObject({ estado: 'en_mantencion', empleadoActualId: bruno.id });
    const enProceso = await prisma.maintenance.count({ where: { assetId: (await activo(1)).id, estado: 'en_proceso' } });
    expect(enProceso).toBe(1);

    const carla = await persona(ruts.libre);
    expect(carla.estado).toBe('activo');
    expect(await activo(2)).toMatchObject({ estado: 'asignado', empleadoActualId: carla.id });
    expect(await prisma.assignment.count({ where: { assetId: (await activo(2)).id, activo: true } })).toBe(1);

    const diego = await persona(ruts.noDevuelto);
    expect(diego.estado).toBe('desvinculado');
    expect(await activo(3)).toMatchObject({ estado: 'no_devuelto', empleadoActualId: diego.id });
    expect(await prisma.assignment.count({ where: { assetId: (await activo(3)).id, activo: true } })).toBe(1);

    // La persona sin RUT era la que ya existia: sigue siendo una sola y el equipo queda a su nombre.
    expect(await prisma.employee.count({ where: { apellidoPaterno: `${apellido}Sinrut` } })).toBe(1);
    expect(await activo(4)).toMatchObject({ estado: 'asignado', empleadoActualId: ids.sinRut });

    // Quedan en la auditoria las 4 personas nuevas.
    const creadas = await prisma.auditLog.count({ where: { entidad: 'empleado', accion: 'crear', entidadId: { in: [ana.id, bruno.id, carla.id, diego.id] } } });
    expect(creadas).toBe(4);
  });

  test('una persona desvinculada que ya existe no recupera un equipo asignado ni cambia de estado', async () => {
    const otra = rut(base + 9);
    await prisma.employee.create({ data: { rut: otra, nombres: 'Eva', apellidoPaterno: `${apellido}Fuera`, estado: 'desvinculado', sedeId: ids.sede } });
    const extra = imei(`36${Math.floor(Math.random() * 1e11).toString().padStart(11, '0')}7`.slice(0, 14));
    imeis.push(extra);
    const r = await importarTanda(
      { categoria: `Cel ${s}`, sedeId: ids.sede, rows: [{ rowIndex: 0, data: fila({ imei: extra, estado: 'Asignado', rut: otra, nombre: 'Eva', apellidoP: `${apellido}Fuera` }) }] },
      sesion
    );
    expect(r.results[0].errors[0]?.type).toBe('empleado_desvinculado');
    expect((await prisma.employee.findUniqueOrThrow({ where: { rut: otra } })).estado).toBe('desvinculado');
    expect(await prisma.asset.count({ where: { imei: extra } })).toBe(0);
  });
});
