/** @jest-environment node */
/**
 * Lineas telefonicas contra Postgres real (SPEC 2.131): alta, edicion, baja,
 * eliminacion con auditoria e importacion de la conciliacion. Solo corre
 * contra la base de pruebas (ver concurrencia.int.test.ts).
 */
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { prisma } from '@/shared/prisma';
import { lineaSchema } from '@/modules/lineas';
import { crearLinea, editarLinea, eliminarLinea, importarLineas, listarLineas } from '@/modules/lineas/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

/** Numero de celular al azar, para no chocar con otras corridas. */
const numeroAlAzar = () => `5699${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
const datos = (extra: Record<string, unknown>) => lineaSchema.parse(extra);

/** Libro como la conciliacion: titulo, nota, fila vacia y el encabezado en la fila 4. */
async function libro(consolidado: (string | number | null)[][], bajas: (string | number)[][]) {
  const wb = new ExcelJS.Workbook();
  const hoja = (nombre: string, encabezado: string[], filas: (string | number | null)[][]) => {
    const ws = wb.addWorksheet(nombre);
    ws.addRow([nombre]);
    ws.addRow(['nota']);
    ws.addRow([]);
    ws.addRow(encabezado);
    filas.forEach((f) => ws.addRow(f));
  };
  hoja(
    'Consolidado',
    ['Línea normalizada', 'Estado', 'Responsable / ubicación', 'Documento(s)', 'Precio plan', 'Descripción plan', 'Observación'],
    consolidado
  );
  hoja('Bajas', ['Línea normalizada', 'Estado', 'Fecha actualización'], bajas);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

describir('lineas telefonicas en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const rut = `${10 + Math.floor(Math.random() * 80)}.${s.replace(/\D/g, '0').slice(0, 3)}.${s.replace(/\D/g, '1').slice(3, 6)}-K`;
  const ids: { celular?: string; notebook?: string; empleado?: string; categorias: string[] } = { categorias: [] };
  const numeros: string[] = [];
  const nuevo = () => {
    const n = numeroAlAzar();
    numeros.push(n);
    return n;
  };

  beforeAll(async () => {
    const celular = await prisma.assetCategory.create({ data: { nombre: `Cel ${s}`, tipoFicha: 'celular' } });
    const notebook = await prisma.assetCategory.create({ data: { nombre: `Nb ${s}`, tipoFicha: 'computador' } });
    ids.categorias.push(celular.id, notebook.id);
    ids.celular = (await prisma.asset.create({ data: { categoriaId: celular.id, marca: 'Samsung', modelo: `A55 ${s}` } })).id;
    ids.notebook = (await prisma.asset.create({ data: { categoriaId: notebook.id, marca: 'Dell', modelo: `Nb ${s}` } })).id;
    ids.empleado = (
      await prisma.employee.create({ data: { nombres: 'Prueba', apellidoPaterno: `Lineas${s}`, rut, estado: 'activo' } })
    ).id;
  });

  afterAll(async () => {
    const lineas = await prisma.lineaTelefonica.findMany({ where: { numero: { in: numeros } }, select: { id: true } });
    await prisma.auditLog.deleteMany({ where: { entidad: 'linea', entidadId: { in: lineas.map((l) => l.id) } } });
    await prisma.lineaTelefonica.deleteMany({ where: { numero: { in: numeros } } });
    await prisma.asset.deleteMany({ where: { id: { in: [ids.celular!, ids.notebook!] } } });
    await prisma.assetCategory.deleteMany({ where: { id: { in: ids.categorias } } });
    await prisma.employee.deleteMany({ where: { id: ids.empleado } });
    await prisma.$disconnect();
  });

  test('crea con el número normalizado, asociada a celular y persona, y queda en la auditoría', async () => {
    const n = nuevo();
    const linea = await crearLinea(
      datos({ numero: `+56 9 ${n.slice(3, 7)} ${n.slice(7)}`, plan: 'Plan X', precioMensual: '18479', activoId: ids.celular, empleadoId: ids.empleado }),
      'jsoto'
    );
    expect(linea).toMatchObject({ numero: n, precioMensual: 18479, estado: 'activa', activoId: ids.celular });
    const audit = await prisma.auditLog.findFirst({ where: { entidad: 'linea', entidadId: linea.id } });
    expect(audit).toMatchObject({ accion: 'crear', descripcion: `Línea ${n} creada`, usuarioSistema: 'jsoto' });
    // La ficha del celular y la de la persona la encuentran.
    expect(await listarLineas({ busqueda: `Lineas${s}` })).toEqual([expect.objectContaining({ id: linea.id })]);
  });

  test('rechaza un número repetido y un equipo que no es celular', async () => {
    const n = nuevo();
    await crearLinea(datos({ numero: n }));
    await expect(crearLinea(datos({ numero: n.slice(2) }))).rejects.toMatchObject({ status: 409 });
    await expect(crearLinea(datos({ numero: nuevo(), activoId: ids.notebook }))).rejects.toMatchObject({
      details: [{ field: 'activoId', message: 'Elige un celular del inventario' }],
    });
  });

  test('darla de baja pone la fecha de baja; reactivarla la quita', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n }));
    const baja = await editarLinea(linea.id, datos({ numero: n, estado: 'baja' }), 'jsoto');
    expect(baja.fechaBaja).toBeInstanceOf(Date);
    const activa = await editarLinea(linea.id, datos({ numero: n, estado: 'activa' }));
    expect(activa.fechaBaja).toBeNull();
    const descripciones = (
      await prisma.auditLog.findMany({ where: { entidadId: linea.id }, orderBy: { createdAt: 'asc' } })
    ).map((a) => a.descripcion);
    expect(descripciones).toEqual([`Línea ${n} creada`, `Línea ${n} dada de baja`, `Línea ${n} reactivada`]);
  });

  test('eliminar la borra y deja sus datos en la auditoría', async () => {
    const n = nuevo();
    const linea = await crearLinea(datos({ numero: n, plan: 'Plan Y' }));
    await eliminarLinea(linea.id, 'jsoto');
    expect(await prisma.lineaTelefonica.findUnique({ where: { id: linea.id } })).toBeNull();
    const audit = await prisma.auditLog.findFirst({ where: { entidadId: linea.id, accion: 'eliminar' } });
    expect(audit?.datosAnteriores).toMatchObject({ numero: n, plan: 'Plan Y' });
  });

  test('importa la conciliación: persona por RUT, bajas con su fecha, dudosas como texto y sin pisar lo existente', async () => {
    const [conPersona, deBaja, duplicada, existente] = [nuevo(), nuevo(), nuevo(), nuevo()];
    await crearLinea(datos({ numero: existente, estado: 'activa' }));
    const buffer = await libro(
      [
        [conPersona, 'Coincide', 'Prueba', rut, 18479, '2404 Emp. Extra SIM', null],
        [deBaja, 'Dada de baja', 'Bodega Concepción', null, 18479, '2404 Emp. Extra SIM', 'Baja confirmada'],
        [duplicada, 'Coincide', 'Ana | Luis', '1-9 | 2-7', 14277, '2403 Emp. Extra SIM', 'La misma línea en dos personas'],
        [existente, 'Dada de baja', 'Bodega Santiago', null, 22681, '2203 Emp. Extra SIM', null],
        ['123', 'No asignada', null, null, null, null, null],
      ],
      [[deBaja, 'Dada de baja', '2026-08-13']]
    );

    const r = await importarLineas(buffer, 'jsoto');
    expect(r).toEqual({ nuevas: 3, completadas: 1, conPersona: 1, invalidas: ['123'] });

    const porNumero = new Map(
      (await prisma.lineaTelefonica.findMany({ where: { numero: { in: numeros } } })).map((l) => [l.numero, l])
    );
    expect(porNumero.get(conPersona)).toMatchObject({ empleadoId: ids.empleado, responsable: null, precioMensual: 18479 });
    expect(porNumero.get(deBaja)).toMatchObject({ estado: 'baja', responsable: 'Bodega Concepción' });
    expect(porNumero.get(deBaja)?.fechaBaja?.toISOString().slice(0, 10)).toBe('2026-08-13');
    expect(porNumero.get(duplicada)).toMatchObject({ empleadoId: null, responsable: 'Ana | Luis' });
    // La que ya existia solo completa lo que le faltaba: el estado no cambia.
    expect(porNumero.get(existente)).toMatchObject({ estado: 'activa', plan: '2203 Emp. Extra SIM', responsable: 'Bodega Santiago' });

    // Importar de nuevo no duplica ni cambia nada.
    expect(await importarLineas(buffer)).toEqual({ nuevas: 0, completadas: 0, conPersona: 1, invalidas: ['123'] });
  });
});
