/** @jest-environment node */
/**
 * Filtros y tarjetas de Activos > Lineas (SPEC 2.131), contra Postgres real: la
 * lista y los indicadores usan los mismos filtros; las tarjetas cuentan cada
 * grupo con los demas filtros puestos. Las lineas de la prueba comparten un
 * trozo de numero, asi la busqueda las aisla del resto de la base.
 */
import { prisma } from '@/shared/prisma';
import { SIN_DATO_LINEA } from '@/modules/lineas';
import { indicadoresLineas, lineasPorConfirmar, listarLineas } from '@/modules/lineas/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('filtros de líneas, en Postgres', () => {
  const trozo = String(Math.floor(100000 + Math.random() * 899999));
  const numero = (i: number) => `569${trozo}${i}0`;
  const ids: { lineas: string[]; empleado?: string; ido?: string; celular?: string; categoria?: string; plan?: string } = { lineas: [] };
  const q = trozo;

  beforeAll(async () => {
    const estado = async (clave: string) => (await prisma.estadoLinea.findFirstOrThrow({ where: { clave } })).id;
    const [activa, baja, porConfirmar] = await Promise.all([estado('activa'), estado('baja'), estado('por_confirmar')]);
    ids.plan = (await prisma.planLinea.create({ data: { nombre: `Plan ${trozo}` } })).id;
    ids.categoria = (await prisma.assetCategory.create({ data: { nombre: `Cel ${trozo}`, tipoFicha: 'celular' } })).id;
    ids.empleado = (await prisma.employee.create({ data: { nombres: 'Ana', apellidoPaterno: `F${trozo}`, estado: 'activo' } })).id;
    ids.ido = (await prisma.employee.create({ data: { nombres: 'Beto', apellidoPaterno: `F${trozo}`, estado: 'desvinculado' } })).id;
    ids.celular = (await prisma.asset.create({ data: { categoriaId: ids.categoria, marca: 'Samsung', modelo: 'A15', estado: 'baja' } })).id;
    const crear = (i: number, data: object) => prisma.lineaTelefonica.create({ data: { numero: numero(i), estadoId: activa, ...data } }).then((l) => ids.lineas.push(l.id));
    await crear(1, { empleadoId: ids.empleado, planId: ids.plan, precioMensual: 10000 }); // activa, con persona, con plan
    await crear(2, { precioMensual: 5000 }); // activa, sin persona, sin plan
    await crear(3, { estadoId: porConfirmar }); // por confirmar, sin persona
    await crear(4, { estadoId: baja, fechaBaja: new Date() }); // de baja
    await crear(5, { activoId: ids.celular }); // en un celular de baja: para revisar
    await crear(6, { empleadoId: ids.ido }); // con alguien que se fue: para revisar
  });

  afterAll(async () => {
    await prisma.lineaHistorial.deleteMany({ where: { lineaId: { in: ids.lineas } } });
    await prisma.lineaTenencia.deleteMany({ where: { lineaId: { in: ids.lineas } } });
    await prisma.lineaTelefonica.deleteMany({ where: { id: { in: ids.lineas } } });
    await prisma.asset.deleteMany({ where: { id: ids.celular } });
    await prisma.employee.deleteMany({ where: { id: { in: [ids.empleado!, ids.ido!] } } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.planLinea.deleteMany({ where: { id: ids.plan } });
    await prisma.$disconnect();
  });

  const numeros = async (f: Parameters<typeof listarLineas>[0]) => (await listarLineas({ q, ...f })).map((l) => l.numero.slice(-2, -1)).sort();

  test('la lista combina estado, plan, asignación y "para revisar"', async () => {
    expect(await numeros({})).toEqual(['1', '2', '3', '4', '5', '6']); // sin estado: todas
    expect(await numeros({ estado: 'vigentes' })).toEqual(['1', '2', '3', '5', '6']);
    expect(await numeros({ estado: 'baja' })).toEqual(['4']);
    expect(await numeros({ plan: ids.plan })).toEqual(['1']);
    expect(await numeros({ plan: SIN_DATO_LINEA })).toEqual(['2', '3', '4', '5', '6']);
    expect(await numeros({ estado: 'vigentes', asignacion: 'sin' })).toEqual(['2', '3', '5']);
    expect(await numeros({ asignacion: 'desvinculada' })).toEqual(['6']);
    expect(await numeros({ revisar: true })).toEqual(['5', '6']);
  });

  test('las tarjetas cuentan cada grupo con los demás filtros; los costos, lo filtrado', async () => {
    const d = await indicadoresLineas({ q, estado: 'baja' });
    expect(d.tarjetas).toMatchObject({ total: 6, activas: { lineas: 4 }, porConfirmar: { lineas: 1 }, sinAsignar: 3, revisar: 2, deBaja: { lineas: 1 } });
    expect(d.vigentes.lineas).toBe(0); // filtrado a "de baja"
    const v = await indicadoresLineas({ q });
    expect(v.vigentes).toEqual({ lineas: 5, costo: 15000 });
    expect(v.porPlan.find((g) => g.valor === ids.plan)).toMatchObject({ lineas: 1, costo: 10000 });
    expect(v.porPlan.find((g) => g.valor === SIN_DATO_LINEA)).toMatchObject({ nombre: 'Sin plan', lineas: 5 }); // sin estado: tambien la de baja
  });

  test('el Dashboard cuenta las líneas por confirmar', async () => {
    const r = await lineasPorConfirmar();
    expect(r.estadoId).toBeTruthy();
    expect(r.lineas).toBeGreaterThanOrEqual(1);
  });
});
