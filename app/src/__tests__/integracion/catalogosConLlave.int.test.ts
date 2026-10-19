/** @jest-environment node */
/**
 * Catalogos del equipo con llave foranea (SPEC 2.168), contra Postgres real:
 * el equipo guarda la llave de su marca y de su sistema operativo, antivirus y
 * licencia; renombrar una opcion se ve en todos los equipos sin tocarlos, y la
 * base no deja borrar una opcion en uso. Solo corre contra la base de pruebas.
 */
import { randomUUID } from 'crypto';
import { prisma } from '@/shared/prisma';
import {
  crearActivo,
  detalleActivo,
  editarActivo,
  eliminarOpcion,
  renombrarOpcion,
} from '@/modules/activos/servidor';

const hayBaseDePrueba = (process.env.DATABASE_URL ?? '').includes('_test');
const describir = hayBaseDePrueba ? describe : describe.skip;

describir('catálogos del equipo con llave foránea, en Postgres', () => {
  const s = randomUUID().slice(0, 8);
  const ids: { categoria?: string; marca?: string; so?: string; activo?: string } = {};
  const marca = `Marca${s}`;
  const so = `SO ${s}`;

  beforeAll(async () => {
    ids.categoria = (
      await prisma.assetCategory.create({ data: { nombre: `Nb ${s}`, tipoFicha: 'computador' } })
    ).id;
    ids.marca = (await prisma.marca.create({ data: { nombre: marca } })).id;
    ids.so = (await prisma.sistemaOperativo.create({ data: { nombre: so } })).id;
  });

  afterAll(async () => {
    await prisma.assetHistory.deleteMany({ where: { assetId: ids.activo } });
    await prisma.asset.deleteMany({ where: { id: ids.activo } });
    await prisma.marca.deleteMany({ where: { nombre: { startsWith: `Marca${s}` } } });
    await prisma.sistemaOperativo.deleteMany({ where: { id: ids.so } });
    await prisma.assetCategory.deleteMany({ where: { id: ids.categoria } });
    await prisma.$disconnect();
  });

  const nuevo = (extra: object = {}) =>
    prisma.$transaction((tx) =>
      crearActivo(
        tx,
        {
          categoriaId: ids.categoria!,
          marca: marca.toLowerCase(),
          modelo: 'Latitude',
          numeroSerie: `SN-${s}`,
          condicion: 'nuevo',
          sistemaOperativo: so,
          ...extra,
        },
        { sedeId: null, usuario: 'qa-catalogos' }
      )
    );

  test('el equipo guarda la llave de su opción, buscada sin importar mayúsculas', async () => {
    const creado = await nuevo();
    ids.activo = creado.id;
    expect(creado).toMatchObject({
      marcaId: ids.marca,
      sistemaOperativoId: ids.so,
      antivirusId: null,
      licenciaMicrosoft365Id: null,
    });
    // La ficha lee el nombre por la relacion.
    expect(await detalleActivo(creado.id)).toMatchObject({
      marca: { nombre: marca },
      sistemaOperativo: { nombre: so },
    });
  });

  test('una opción que no está en su catálogo se rechaza en su campo y no crea nada', async () => {
    await expect(
      nuevo({ numeroSerie: `SN2-${s}`, antivirus: `No existe ${s}` })
    ).rejects.toMatchObject({
      details: [{ field: 'antivirus' }],
    });
    expect(await prisma.asset.count({ where: { numeroSerie: `SN2-${s}` } })).toBe(0);
  });

  test('renombrar la opción se ve en el equipo sin tocarlo; vaciar el sistema operativo lo deja sin valor', async () => {
    await renombrarOpcion('marcas', ids.marca!, `${marca} Nueva`, 'qa-catalogos');
    expect(await detalleActivo(ids.activo!)).toMatchObject({
      marcaId: ids.marca,
      marca: { nombre: `${marca} Nueva` },
    });
    await editarActivo(ids.activo!, { sistemaOperativo: '' }, 'qa-catalogos');
    expect(await detalleActivo(ids.activo!)).toMatchObject({
      sistemaOperativoId: null,
      sistemaOperativo: null,
    });
  });

  test('una opción en uso no se borra: se desactiva, y la llave foránea tampoco lo permitiría', async () => {
    await expect(eliminarOpcion('marcas', ids.marca!, 'qa-catalogos')).resolves.toEqual({
      desactivado: true,
    });
    expect(await prisma.marca.findUnique({ where: { id: ids.marca } })).toMatchObject({
      activo: false,
    });
    // Directo en la base: Postgres rechaza borrar una marca que un equipo referencia.
    await expect(prisma.marca.delete({ where: { id: ids.marca } })).rejects.toThrow();
    // El equipo conserva su marca desactivada al editar otro dato.
    await expect(
      editarActivo(ids.activo!, { marca: `${marca} Nueva`, modelo: 'Latitude 2' }, 'qa-catalogos')
    ).resolves.toMatchObject({
      marcaId: ids.marca,
      modelo: 'Latitude 2',
    });
  });
});
