/** @jest-environment node */
/**
 * Opciones de supervisor, division, area, sub-area y listas de distribucion
 * (SPEC 2.142), contra Postgres real: crear sin repetir, contar quien las tiene,
 * renombrar corrige a las personas (en una lista, solo ese nombre) y eliminar una
 * en uso solo la desactiva. Solo corre contra la base de pruebas.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import {
  crearOpcionPersona,
  eliminarOpcionPersona,
  listarOpcionesPersona,
  renombrarOpcionPersona,
} from '@/modules/personas/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('opciones de la persona, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: string[] = [];
  const persona = async (datos: { division?: string; listasDistribucion?: string }) => {
    const p = await prisma.employee.create({
      data: { nombres: `Op${s}`, apellidoPaterno: 'Prueba', correoPersonal: `${randomUUID()}@prueba.cl`, ...datos },
    });
    ids.push(p.id);
    return p;
  };

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { id: { in: ids } } });
    await prisma.opcionPersona.deleteMany({ where: { nombre: { contains: s } } });
    await prisma.$disconnect();
  });

  test('crear no repite (sin importar mayusculas) y reactiva una desactivada', async () => {
    const nombre = `Div ${s}`;
    const { opcion, creada } = await crearOpcionPersona('division', nombre);
    expect(creada).toBe(true);
    expect((await crearOpcionPersona('division', nombre.toUpperCase())).creada).toBe(false);

    await prisma.opcionPersona.update({ where: { id: opcion.id }, data: { activo: false } });
    expect((await listarOpcionesPersona('division', { soloActivas: true })).some((o) => o.id === opcion.id)).toBe(false);
    const otra = await crearOpcionPersona('division', nombre);
    expect(otra.opcion.id).toBe(opcion.id);
    expect(otra.opcion.activo).toBe(true);
  });

  test('cada tipo tiene su propia lista', async () => {
    const nombre = `Mismo ${s}`;
    await crearOpcionPersona('area', nombre);
    await crearOpcionPersona('sub_area', nombre);
    expect((await listarOpcionesPersona('area')).filter((o) => o.nombre === nombre)).toHaveLength(1);
    expect((await listarOpcionesPersona('sub_area')).filter((o) => o.nombre === nombre)).toHaveLength(1);
  });

  test('renombrar corrige a las personas que la tienen', async () => {
    const vieja = `Vieja ${s}`;
    const { opcion } = await crearOpcionPersona('division', vieja);
    const ana = await persona({ division: vieja });
    const sinOpcion = await persona({ division: `Otra ${s}` });

    const listada = (await listarOpcionesPersona('division', { conUso: true })).find((o) => o.id === opcion.id);
    expect(listada).toMatchObject({ enUso: 1, enSede: 1 });

    await renombrarOpcionPersona('division', opcion.id, `Nueva ${s}`);
    expect((await prisma.employee.findUnique({ where: { id: ana.id } }))?.division).toBe(`Nueva ${s}`);
    expect((await prisma.employee.findUnique({ where: { id: sinOpcion.id } }))?.division).toBe(`Otra ${s}`);
  });

  test('renombrar a un nombre que ya existe se rechaza', async () => {
    const a = await crearOpcionPersona('supervisor', `Sup A ${s}`);
    await crearOpcionPersona('supervisor', `Sup B ${s}`);
    await expect(renombrarOpcionPersona('supervisor', a.opcion.id, `sup b ${s}`)).rejects.toThrow(/Ya existe/);
  });

  test('en una lista de distribucion solo cambia ese nombre', async () => {
    const lista = await crearOpcionPersona('lista_distribucion', `Masivo ${s}`);
    const p = await persona({ listasDistribucion: `Otra ${s}, Masivo ${s}, Tercera ${s}` });
    expect(((await listarOpcionesPersona('lista_distribucion', { conUso: true })).find((o) => o.id === lista.opcion.id) as { enUso?: number } | undefined)?.enUso).toBe(1);

    await renombrarOpcionPersona('lista_distribucion', lista.opcion.id, `Corporativo ${s}`);
    expect((await prisma.employee.findUnique({ where: { id: p.id } }))?.listasDistribucion).toBe(
      `Otra ${s}, Corporativo ${s}, Tercera ${s}`
    );
  });

  test('eliminar una en uso la desactiva; sin uso la borra', async () => {
    const enUso = await crearOpcionPersona('division', `EnUso ${s}`);
    await persona({ division: `EnUso ${s}` });
    expect(await eliminarOpcionPersona('division', enUso.opcion.id)).toEqual({ desactivado: true });
    expect((await prisma.opcionPersona.findUnique({ where: { id: enUso.opcion.id } }))?.activo).toBe(false);

    const libre = await crearOpcionPersona('division', `Libre ${s}`);
    expect(await eliminarOpcionPersona('division', libre.opcion.id)).toEqual({ desactivado: false });
    expect(await prisma.opcionPersona.findUnique({ where: { id: libre.opcion.id } })).toBeNull();
  });
});
