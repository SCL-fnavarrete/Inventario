/** @jest-environment node */
/**
 * Historial de cada equipo (SPEC 2.133), contra Postgres real: las entregas
 * anteriores de un archivo normalizado (hojas ENTREGAS y PERSONAS) quedan como
 * asignaciones cerradas del equipo, con su persona y sus fechas; una persona que
 * no existe se crea con el estado que dice el archivo; importar dos veces no
 * repite nada. Solo corre contra la base de pruebas (ver concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { prisma } from '@/shared/prisma';
import { importarHistorial } from '@/modules/importacion/servidor';
import { crearEquipo } from '@/test-utils/catalogos';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

const imei = (base14: string) => {
  const suma = [...base14].reverse().reduce((t, c, i) => {
    let d = +c;
    if (i % 2 === 0) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    return t + d;
  }, 0);
  return base14 + String((10 - (suma % 10)) % 10);
};
const rut = (cuerpo: number) => {
  let s = 0, m = 2;
  for (const c of [...String(cuerpo)].reverse()) { s += +c * m; m = m === 7 ? 2 : m + 1; }
  const r = 11 - (s % 11);
  const dv = r === 11 ? '0' : r === 10 ? 'K' : String(r);
  return `${String(cuerpo).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}-${dv}`;
};
const letras = (n: number) => Array.from({ length: n }, () => String.fromCharCode(97 + Math.floor(Math.random() * 26))).join('');
const dia = (d: Date | null) => d?.toISOString().slice(0, 10);

describir('historial de equipos, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const apellido = `Zh${letras(8)}`;
  const base = 80_000_000 + Math.floor(Math.random() * 9_000_000);
  const ruts = { ana: rut(base), bruno: rut(base + 1), carla: rut(base + 2), diego: rut(base + 3) };
  const imeiA = imei(`35${Math.floor(Math.random() * 1e11).toString().padStart(11, '0')}1`.slice(0, 14));
  const sesion = { user: { id: 'u-test', usuario: 'qa-historial', role: 'admin', sedeId: null } } as never;
  const ids: { sede?: string; categoria?: string; activo?: string; ana?: string; carla?: string } = {};

  /** Un Excel normalizado con las hojas ENTREGAS y PERSONAS. */
  const archivo = async (entregas: (string | Date | null)[][]) => {
    const wb = new ExcelJS.Workbook();
    const e = wb.addWorksheet('ENTREGAS');
    e.addRow(['IMEI', 'Marca', 'Modelo', 'RUT', 'Persona', 'Desde', 'Hasta', '¿Actual?', 'Observaciones']);
    entregas.forEach((f) => e.addRow(f));
    const p = wb.addWorksheet('PERSONAS');
    p.addRow(['RUT', 'Nombres', 'Apellido P.', 'Apellido M.', 'Estado', 'Correo empresa', 'Cargo']);
    p.addRow([ruts.bruno, 'Bruno', `${apellido}Bruno`, 'Soto', 'Desvinculado', '', '']);
    p.addRow([ruts.carla, 'Carla', `${apellido}Carla`, '', 'Activo', '', '']);
    p.addRow([ruts.ana, 'Ana', apellido, '', 'Activo', '', '']);
    p.addRow([ruts.diego, 'Diego', `${apellido}Diego`, '', 'Activo', '', 'Analista']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
  };
  const FILAS = (): (string | Date | null)[][] => [
    [imeiA, 'Motorola', 'G54', ruts.bruno, `Bruno ${apellido}Bruno Soto`, new Date('2024-02-15T00:00:00Z'), new Date('2025-01-10T00:00:00Z'), 'No', 'Devuelto con la pantalla trizada'],
    [imeiA, 'Motorola', 'G54', ruts.carla, `Carla ${apellido}Carla`, new Date('2025-01-10T00:00:00Z'), new Date('2025-09-01T00:00:00Z'), 'No'],
    // La actual no se importa aqui (la crea Activos) y un periodo sin persona no es una entrega.
    [imeiA, 'Motorola', 'G54', ruts.ana, `Ana ${apellido}`, new Date('2025-09-01T00:00:00Z'), null, 'Sí'],
    [imeiA, 'Motorola', 'G54', null, '(sin persona)', null, null, 'No'],
    // Un celular que no esta en el sistema.
    [imei('3599999999999'.slice(0, 14)), 'Motorola', 'G54', ruts.diego, `Diego ${apellido}Diego`, new Date('2024-03-01T00:00:00Z'), null, 'No'],
  ];

  beforeAll(async () => {
    ids.sede = (await prisma.sede.create({ data: { codigo: `H${s}`, nombre: `Hist ${s}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cel ${s}`, tipoFicha: 'celular' } })).id;
    ids.ana = (await prisma.employee.create({ data: { rut: ruts.ana, nombres: 'Ana', apellidoPaterno: apellido, estado: 'activo', sedeId: ids.sede } })).id;
    ids.carla = (await prisma.employee.create({ data: { rut: ruts.carla, nombres: 'Carla', apellidoPaterno: `${apellido}Carla`, estado: 'activo', sedeId: ids.sede } })).id;
    ids.activo = (await crearEquipo({ categoriaId: ids.categoria, sedeId: ids.sede, marca: 'Motorola', modelo: 'G54', imei: imeiA, estado: 'asignado', empleadoActualId: ids.ana })).id;
  });

  afterAll(async () => {
    const empleados = await prisma.employee.findMany({ where: { apellidoPaterno: { startsWith: apellido } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entidadId: { in: empleados.map((e) => e.id) } } });
    await prisma.assignment.deleteMany({ where: { assetId: ids.activo } });
    await prisma.assetHistory.deleteMany({ where: { assetId: ids.activo } });
    await prisma.asset.deleteMany({ where: { id: ids.activo } });
    await prisma.employee.deleteMany({ where: { id: { in: empleados.map((e) => e.id) } } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.sede.deleteMany({ where: { id: ids.sede } });
    await prisma.$disconnect();
  });

  test('la revisión cuenta lo que se haría sin guardar nada', async () => {
    const r = await importarHistorial(await archivo(FILAS()), sesion, false);
    expect(r).toMatchObject({ confirmado: false, total: 3, registradas: 2, repetidas: 0, errores: 1, personasNuevasDesvinculadas: 1, personasNuevasActivas: 0 });
    expect(r.resultados.find((x) => x.resultado === 'error')?.mensaje).toMatch(/importa primero los equipos/);
    expect(await prisma.assignment.count({ where: { assetId: ids.activo } })).toBe(0);
    expect(await prisma.employee.count({ where: { rut: ruts.bruno } })).toBe(0);
  });

  test('al importar, las entregas anteriores quedan como asignaciones cerradas con su persona y el equipo sigue con quien lo tiene', async () => {
    const r = await importarHistorial(await archivo(FILAS()), sesion, true);
    expect(r).toMatchObject({ confirmado: true, registradas: 2, errores: 1, personasNuevasDesvinculadas: 1 });

    const bruno = await prisma.employee.findUniqueOrThrow({ where: { rut: ruts.bruno } });
    expect(bruno).toMatchObject({ estado: 'desvinculado', nombres: 'Bruno', correoEmpresa: null, sedeId: ids.sede });

    const asignaciones = await prisma.assignment.findMany({ where: { assetId: ids.activo }, orderBy: { fechaEntrega: 'asc' } });
    expect(asignaciones).toHaveLength(2);
    expect(asignaciones[0]).toMatchObject({ employeeId: bruno.id, activo: false, tipoMovimiento: 'ingreso' });
    expect([dia(asignaciones[0].fechaEntrega), dia(asignaciones[0].fechaDevolucion)]).toEqual(['2024-02-15', '2025-01-10']);
    // El comentario de la entrega queda en el historial de la persona.
    expect(asignaciones[0].observacionesDevolucion).toBe('Entrega anterior importada desde Excel: Devuelto con la pantalla trizada');
    expect(asignaciones[1]).toMatchObject({ employeeId: ids.carla, activo: false });
    expect([dia(asignaciones[1].fechaEntrega), dia(asignaciones[1].fechaDevolucion)]).toEqual(['2025-01-10', '2025-09-01']);

    // El equipo sigue con su dueño de hoy y el historial del equipo cuenta quién lo tuvo.
    expect(await prisma.asset.findUniqueOrThrow({ where: { id: ids.activo } })).toMatchObject({ estado: 'asignado', empleadoActualId: ids.ana });
    const eventos = await prisma.assetHistory.findMany({ where: { assetId: ids.activo, tipoEvento: 'asignacion' } });
    expect(eventos).toHaveLength(2);
    expect(eventos.map((e) => e.descripcion).join(' ')).toContain(`Bruno ${apellido}Bruno Soto`);
  });

  test('importar otra vez no repite nada ni duplica a la persona', async () => {
    const r = await importarHistorial(await archivo(FILAS()), sesion, true);
    expect(r).toMatchObject({ registradas: 0, repetidas: 2, errores: 1, personasNuevasDesvinculadas: 0 });
    expect(await prisma.assignment.count({ where: { assetId: ids.activo } })).toBe(2);
    expect(await prisma.employee.count({ where: { rut: ruts.bruno } })).toBe(1);
  });

  test('un monitor, mouse o impresora (sin IMEI) se encuentra por su N° de serie, sin distinguir mayúsculas', async () => {
    const serie = `MON${letras(6).toUpperCase()}${s.toUpperCase()}`;
    const monitor = await crearEquipo({ categoriaId: ids.categoria!, sedeId: ids.sede!, marca: 'Samsung', modelo: 'S27', numeroSerie: serie, estado: 'asignado', empleadoActualId: ids.ana });
    try {
      const wb = new ExcelJS.Workbook();
      const e = wb.addWorksheet('ENTREGAS');
      e.addRow(['N° serie', 'Marca', 'Modelo', 'RUT', 'Persona', 'Desde', 'Hasta', '¿Actual?']);
      // La serie viene en minúsculas en el archivo y en mayúsculas en el sistema.
      e.addRow([serie.toLowerCase(), 'Samsung', 'S27', ruts.diego, `Diego ${apellido}Diego`, new Date('2024-02-01T00:00:00Z'), new Date('2025-11-07T00:00:00Z'), 'No']);
      e.addRow(['SERIE-QUE-NO-EXISTE', 'Samsung', 'S27', ruts.diego, `Diego ${apellido}Diego`, new Date('2024-02-01T00:00:00Z'), null, 'No']);
      e.addRow([serie.toLowerCase(), 'Samsung', 'S27', ruts.ana, `Ana ${apellido}`, new Date('2025-11-07T00:00:00Z'), null, 'Sí']);
      const p = wb.addWorksheet('PERSONAS');
      p.addRow(['RUT', 'Nombres', 'Apellido P.', 'Apellido M.', 'Estado']);
      p.addRow([ruts.diego, 'Diego', `${apellido}Diego`, '', 'Desvinculado']);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      const archivoSerie = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;

      const r = await importarHistorial(archivoSerie, sesion, true);
      expect(r).toMatchObject({ registradas: 1, errores: 1, personasNuevasDesvinculadas: 1 });
      expect(r.resultados.find((x) => x.resultado === 'error')?.mensaje).toMatch(/N° de serie SERIE-QUE-NO-EXISTE/);
      const diego = await prisma.employee.findUniqueOrThrow({ where: { rut: ruts.diego } });
      expect(diego.estado).toBe('desvinculado');
      const asignaciones = await prisma.assignment.findMany({ where: { assetId: monitor.id } });
      expect(asignaciones).toHaveLength(1);
      expect(asignaciones[0]).toMatchObject({ employeeId: diego.id, activo: false });
      expect(dia(asignaciones[0].fechaEntrega)).toBe('2024-02-01');
      // El monitor sigue con su dueña de hoy.
      expect((await prisma.asset.findUniqueOrThrow({ where: { id: monitor.id } })).empleadoActualId).toBe(ids.ana);
      // De nuevo: no repite.
      expect(await importarHistorial(archivoSerie, sesion, true)).toMatchObject({ registradas: 0, repetidas: 1, errores: 1 });
    } finally {
      await prisma.assignment.deleteMany({ where: { assetId: monitor.id } });
      await prisma.assetHistory.deleteMany({ where: { assetId: monitor.id } });
      await prisma.asset.delete({ where: { id: monitor.id } });
    }
  });

  test('un archivo sin la hoja ENTREGAS se rechaza con un mensaje claro', async () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Otra').addRow(['x']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(importarHistorial(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, sesion, false)).rejects.toThrow(/hoja ENTREGAS/);
  });
});
