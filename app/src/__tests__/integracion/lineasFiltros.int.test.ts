/** @jest-environment node */
/**
 * Filtros y tarjetas de Activos > Lineas (SPEC 2.131), contra Postgres real: la
 * lista y los indicadores usan los mismos filtros; las tarjetas cuentan cada
 * grupo con los demas filtros puestos. Las lineas de la prueba comparten un
 * trozo de numero, asi la busqueda las aisla del resto de la base.
 */
import { prisma } from '@/shared/prisma';
import { SIN_DATO_LINEA } from '@/modules/lineas';
import { indicadoresLineas, listarLineas } from '@/modules/lineas/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('filtros de líneas, en Postgres', () => {
  const trozo = String(Math.floor(100000 + Math.random() * 899999));
  const numero = (i: number) => `569${trozo}${i}0`;
  const ids: { lineas: string[]; empleado?: string; ido?: string; celular?: string; categoria?: string; sede?: string; chip?: string } = { lineas: [] };
  const q = trozo;

  beforeAll(async () => {
    const estado = async (clave: string) => (await prisma.estadoLinea.findFirstOrThrow({ where: { clave } })).id;
    const [activa, baja] = await Promise.all([estado('activa'), estado('baja')]);
    ids.chip = (await prisma.tipoChip.create({ data: { nombre: `Chip ${trozo}` } })).id;
    ids.sede = (await prisma.sede.create({ data: { nombre: `Sede ${trozo}`, codigo: `S${trozo}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cel ${trozo}`, tipoFicha: 'celular' } })).id;
    ids.empleado = (await prisma.employee.create({ data: { nombres: 'Ana', apellidoPaterno: `F${trozo}`, estado: 'activo', sedeId: ids.sede } })).id;
    ids.ido = (await prisma.employee.create({ data: { nombres: 'Beto', apellidoPaterno: `F${trozo}`, estado: 'desvinculado' } })).id;
    ids.celular = (await prisma.asset.create({ data: { categoriaId: ids.categoria, marca: 'Samsung', modelo: 'A15', estado: 'baja' } })).id;
    const crear = (i: number, data: object) => prisma.lineaTelefonica.create({ data: { numero: numero(i), estadoId: activa, ...data } }).then((l) => ids.lineas.push(l.id));
    await crear(1, { empleadoId: ids.empleado, tipoChipId: ids.chip }); // activa, con persona (de la sede de prueba), con tipo de chip
    await crear(2, {}); // activa, sin persona
    await crear(3, {}); // activa, sin persona
    await crear(4, { estadoId: baja, fechaBaja: new Date() }); // de baja
    await crear(5, { activoId: ids.celular }); // en un celular de baja
    await crear(6, { empleadoId: ids.ido }); // con alguien que se fue
  });

  afterAll(async () => {
    await prisma.lineaHistorial.deleteMany({ where: { lineaId: { in: ids.lineas } } });
    await prisma.lineaTenencia.deleteMany({ where: { lineaId: { in: ids.lineas } } });
    await prisma.lineaTelefonica.deleteMany({ where: { id: { in: ids.lineas } } });
    await prisma.asset.deleteMany({ where: { id: ids.celular } });
    await prisma.employee.deleteMany({ where: { id: { in: [ids.empleado!, ids.ido!] } } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.tipoChip.deleteMany({ where: { id: ids.chip } });
    await prisma.sede.deleteMany({ where: { id: ids.sede } });
    await prisma.$disconnect();
  });

  const numeros = async (f: Parameters<typeof listarLineas>[0]) => (await listarLineas({ q, ...f })).map((l) => l.numero.slice(-2, -1)).sort();

  test('la lista combina estado, tipo de chip, asignación', async () => {
    expect(await numeros({})).toEqual(['1', '2', '3', '4', '5', '6']); // sin estado: todas
    expect(await numeros({ estado: 'vigentes' })).toEqual(['1', '2', '3', '5', '6']);
    expect(await numeros({ estado: 'baja' })).toEqual(['4']);
    expect(await numeros({ tipoChip: ids.chip })).toEqual(['1']);
    expect(await numeros({ tipoChip: SIN_DATO_LINEA })).toEqual(['2', '3', '4', '5', '6']);
    expect(await numeros({ estado: 'vigentes', asignacion: 'sin' })).toEqual(['2', '3', '5']);
  });

  test('la sede del navbar es la de la persona de la línea (sin celular)', async () => {
    expect(await numeros({ sedeId: ids.sede })).toEqual(['1']);
  });

  test('las tarjetas cuentan cada grupo con los demás filtros', async () => {
    const d = await indicadoresLineas({ q, estado: 'baja' });
    expect(d.tarjetas).toMatchObject({ total: 6, activas: { lineas: 5 }, disponibles: 3, deBaja: { lineas: 1 } });
    const v = await indicadoresLineas({ q });
    expect(v.porTipoChip.find((g) => g.valor === ids.chip)).toMatchObject({ lineas: 1 });
    expect(v.porTipoChip.find((g) => g.valor === SIN_DATO_LINEA)).toMatchObject({ nombre: 'Sin indicar', lineas: 5 });
  });
});
