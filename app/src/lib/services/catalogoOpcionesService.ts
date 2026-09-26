import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { NotFoundError, errorRepetido } from '@/lib/errors';
import { auditLogService } from '@/lib/services/auditLogService';

/**
 * Catalogos de opciones de los activos: sistema operativo, antivirus y
 * licencia Microsoft 365 (SPEC 2.112.7). Antes eran seis rutas copiadas; la
 * logica vive aqui y cada ruta solo abre con su permiso y llama a esto.
 *
 * El campo del activo es texto plano (no una relacion): renombrar una opcion
 * corrige tambien los activos que tenian el nombre anterior, y eliminarla no
 * los toca (solo deja de ofrecerse para activos nuevos).
 */
export const CATALOGOS = {
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

/** Opciones del catalogo; con `conUso`, cuantos activos tienen cada una. */
export async function listarOpciones(clave: ClaveCatalogo, { soloActivas = false, conUso = false } = {}) {
  const { campo } = CATALOGOS[clave];
  const opciones = await tabla(prisma, clave).findMany({
    where: soloActivas ? { activo: true } : undefined,
    orderBy: { nombre: 'asc' },
  });
  if (!conUso || opciones.length === 0) return opciones;

  const conteos = (await prisma.asset.groupBy({
    by: [campo],
    where: { [campo]: { in: opciones.map((o) => o.nombre) } } as Prisma.AssetWhereInput,
    _count: true,
  })) as unknown as Array<Record<string, string> & { _count: number }>;
  const usoPorNombre = new Map(conteos.map((c) => [c[campo], c._count]));
  return opciones.map((o) => ({ ...o, enUso: usoPorNombre.get(o.nombre) ?? 0 }));
}

/**
 * Crea una opcion. Si ya existe (activa o no, sin importar mayusculas) la
 * reactiva en vez de duplicarla. El tecnico tambien puede crear desde el
 * formulario de activos: queda en la auditoria quien fue.
 */
export async function crearOpcion(clave: ClaveCatalogo, nombre: string, usuario?: string | null) {
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
export async function renombrarOpcion(clave: ClaveCatalogo, id: string, nombre: string, usuario?: string | null) {
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

/** Elimina una opcion. Los activos que la tienen guardada no se tocan. */
export async function eliminarOpcion(clave: ClaveCatalogo, id: string, usuario?: string | null) {
  const { etiqueta } = CATALOGOS[clave];
  const actual = await tabla(prisma, clave).findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Opción no encontrada');

  await tabla(prisma, clave).delete({ where: { id } });
  await auditLogService.registrarEliminacion(
    'catalogo',
    id,
    `${etiqueta}: opción eliminada "${actual.nombre}"`,
    { catalogo: etiqueta, nombre: actual.nombre },
    usuario
  );
}
