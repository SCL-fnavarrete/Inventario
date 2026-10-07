import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError, errorRepetido } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { ACTIVOS_VIGENTES } from '@/modules/activos/consultas';
import { nombreDeMarca } from '@/modules/activos/nombreMarca';

/**
 * Catalogos de opciones de los activos: marca (SPEC 2.116.4), sistema
 * operativo, antivirus y licencia Microsoft 365 (SPEC 2.112.7). Antes eran seis rutas copiadas; la
 * logica vive aqui y cada ruta solo abre con su permiso y llama a esto.
 *
 * El campo del activo es texto plano (no una relacion): renombrar una opcion
 * corrige tambien los activos que tenian el nombre anterior, y eliminarla no
 * los toca (solo deja de ofrecerse para activos nuevos).
 */
export const CATALOGOS = {
  marcas: { modelo: 'marca', campo: 'marca', etiqueta: 'Marca' },
  'sistemas-operativos': { modelo: 'sistemaOperativo', campo: 'sistemaOperativo', etiqueta: 'Sistema operativo' },
  antivirus: { modelo: 'antivirus', campo: 'antivirus', etiqueta: 'Antivirus' },
  'licencias-m365': {
    modelo: 'licenciaMicrosoft365',
    campo: 'tipoLicenciaMicrosoft365',
    etiqueta: 'Licencia Microsoft 365',
  },
} as const;

export type ClaveCatalogo = keyof typeof CATALOGOS;

type Opcion = { id: string; nombre: string; activo: boolean; createdAt: Date };

/** Lo comun de las tres tablas (misma forma: id, nombre unico, activo). */
interface TablaOpciones {
  findMany(args: { where?: { activo: boolean }; orderBy: { nombre: 'asc' } }): Promise<Opcion[]>;
  findFirst(args: { where: Record<string, unknown> }): Promise<Opcion | null>;
  findUnique(args: { where: { id: string } }): Promise<Opcion | null>;
  create(args: { data: { nombre: string } }): Promise<Opcion>;
  update(args: { where: { id: string }; data: Partial<Pick<Opcion, 'nombre' | 'activo'>> }): Promise<Opcion>;
  delete(args: { where: { id: string } }): Promise<Opcion>;
}

const tabla = (cliente: Prisma.TransactionClient, clave: ClaveCatalogo) =>
  cliente[CATALOGOS[clave].modelo] as unknown as TablaOpciones;

/**
 * Opciones del catalogo. Con `conUso`, cuantos activos tienen cada una:
 * `enUso` en todas las sedes (avisos de renombrar y eliminar) y `enSede`
 * los vigentes que deja ver `whereSede`, la sede del navbar (SPEC 2.116.3).
 */
export async function listarOpciones(
  clave: ClaveCatalogo,
  { soloActivas = false, conUso = false, whereSede = {} as Prisma.AssetWhereInput } = {}
) {
  const { campo } = CATALOGOS[clave];
  const opciones = await tabla(prisma, clave).findMany({
    where: soloActivas ? { activo: true } : undefined,
    orderBy: { nombre: 'asc' },
  });
  if (!conUso || opciones.length === 0) return opciones;

  const deEstas = { [campo]: { in: opciones.map((o) => o.nombre) } } as Prisma.AssetWhereInput;
  const contar = async (where: Prisma.AssetWhereInput) => {
    const filas = (await prisma.asset.groupBy({ by: [campo], where, _count: true })) as unknown as Array<
      Record<string, string> & { _count: number }
    >;
    return new Map(filas.map((c) => [c[campo], c._count]));
  };
  const [total, sede] = await Promise.all([
    contar(deEstas),
    contar({ ...deEstas, ...ACTIVOS_VIGENTES, ...whereSede }),
  ]);
  return opciones.map((o) => ({ ...o, enUso: total.get(o.nombre) ?? 0, enSede: sede.get(o.nombre) ?? 0 }));
}

/**
 * Crea una opcion. Si ya existe (activa o no, sin importar mayusculas) la
 * reactiva en vez de duplicarla. El tecnico tambien puede crear desde el
 * formulario de activos: queda en la auditoria quien fue.
 */
export async function crearOpcion(clave: ClaveCatalogo, nombreEscrito: string, usuario?: string | null) {
  // Las marcas se escriben siempre igual (SPEC 2.116.4): Dell, no DELL ni dell.
  const nombre = clave === 'marcas' ? nombreDeMarca(nombreEscrito) : nombreEscrito;
  const { etiqueta } = CATALOGOS[clave];
  const existente = await tabla(prisma, clave).findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' } },
  });
  if (existente?.activo) return { opcion: existente, creada: false };

  const opcion = existente
    ? await tabla(prisma, clave).update({ where: { id: existente.id }, data: { activo: true } })
    : await tabla(prisma, clave).create({ data: { nombre } });
  await auditLogService.registrarCreacion(
    'catalogo',
    opcion.id,
    `${etiqueta}: opción ${existente ? 'reactivada' : 'creada'} "${opcion.nombre}"`,
    { catalogo: etiqueta, nombre: opcion.nombre },
    usuario
  );
  return { opcion, creada: !existente };
}

/** Renombra una opcion y corrige los activos que tenian el nombre anterior. */
export async function renombrarOpcion(clave: ClaveCatalogo, id: string, nombreEscrito: string, usuario?: string | null) {
  const nombre = clave === 'marcas' ? nombreDeMarca(nombreEscrito) : nombreEscrito;
  const { campo, etiqueta } = CATALOGOS[clave];
  const actual = await tabla(prisma, clave).findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Opción no encontrada');

  const repetida = await tabla(prisma, clave).findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, NOT: { id } },
  });
  if (repetida) throw errorRepetido('nombre', `Ya existe la opción "${repetida.nombre}"`);

  const { opcion, activos } = await prisma.$transaction(async (tx) => {
    const opcion = await tabla(tx, clave).update({ where: { id }, data: { nombre } });
    const { count } = await tx.asset.updateMany({
      where: { [campo]: actual.nombre } as Prisma.AssetWhereInput,
      data: { [campo]: nombre } as Prisma.AssetUpdateManyMutationInput,
    });
    return { opcion, activos: count };
  });

  await auditLogService.registrarActualizacion(
    'catalogo',
    id,
    `${etiqueta}: opción renombrada "${actual.nombre}" → "${nombre}"${activos ? ` (${activos} activo(s) corregidos)` : ''}`,
    { catalogo: etiqueta, nombre: actual.nombre },
    { catalogo: etiqueta, nombre, activosCorregidos: activos },
    usuario
  );
  return opcion;
}

/**
 * Elimina una opcion. Si algun activo la usa no se borra: se desactiva (deja de
 * ofrecerse y los activos conservan el dato), para no perder lo registrado
 * (SPEC 2.136). Devuelve si quedo desactivada.
 */
export async function eliminarOpcion(clave: ClaveCatalogo, id: string, usuario?: string | null) {
  const { etiqueta, campo } = CATALOGOS[clave];
  const actual = await tabla(prisma, clave).findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Opción no encontrada');

  const enUso = await prisma.asset.count({ where: { [campo]: actual.nombre } as Prisma.AssetWhereInput });
  if (enUso > 0) {
    await tabla(prisma, clave).update({ where: { id }, data: { activo: false } });
    await auditLogService.registrarActualizacion(
      'catalogo',
      id,
      `${etiqueta}: opción desactivada "${actual.nombre}" (la usan ${enUso} activo(s))`,
      { catalogo: etiqueta, nombre: actual.nombre, activo: actual.activo },
      { catalogo: etiqueta, nombre: actual.nombre, activo: false },
      usuario
    );
    return { desactivado: true };
  }

  await tabla(prisma, clave).delete({ where: { id } });
  await auditLogService.registrarEliminacion(
    'catalogo',
    id,
    `${etiqueta}: opción eliminada "${actual.nombre}"`,
    { catalogo: etiqueta, nombre: actual.nombre },
    usuario
  );
  return { desactivado: false };
}
