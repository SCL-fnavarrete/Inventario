import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError, errorDeCampo, errorRepetido } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { ACTIVOS_VIGENTES } from '@/modules/activos/consultas';
import { nombreDeMarca } from '@/modules/activos/nombreMarca';
import { CAMPOS_CATALOGO, NOMBRES_CAMPOS_CATALOGO, type CampoCatalogo, type LlaveCatalogo } from '@/modules/activos/camposCatalogo';

/**
 * Catalogos de opciones de los activos: marca (SPEC 2.116.4), sistema
 * operativo, antivirus y licencia Microsoft 365 (SPEC 2.112.7). Antes eran seis rutas copiadas; la
 * logica vive aqui y cada ruta solo abre con su permiso y llama a esto.
 *
 * El equipo referencia la opcion por su llave (SPEC 2.168): renombrarla la
 * cambia en todos los equipos sin tocarlos, y una en uso no se borra (se
 * desactiva; la llave foranea tampoco lo permitiria).
 */
const de = (campo: CampoCatalogo) => ({ llave: CAMPOS_CATALOGO[campo].llave, etiqueta: CAMPOS_CATALOGO[campo].etiqueta });
export const CATALOGOS = {
  marcas: { modelo: 'marca', ...de('marca') },
  'sistemas-operativos': { modelo: 'sistemaOperativo', ...de('sistemaOperativo') },
  antivirus: { modelo: 'antivirus', ...de('antivirus') },
  'licencias-m365': { modelo: 'licenciaMicrosoft365', ...de('tipoLicenciaMicrosoft365') },
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
  const { llave } = CATALOGOS[clave];
  const opciones = await tabla(prisma, clave).findMany({
    where: soloActivas ? { activo: true } : undefined,
    orderBy: { nombre: 'asc' },
  });
  if (!conUso || opciones.length === 0) return opciones;

  const deEstas = { [llave]: { in: opciones.map((o) => o.id) } } as Prisma.AssetWhereInput;
  const contar = async (where: Prisma.AssetWhereInput) => {
    const filas = (await prisma.asset.groupBy({ by: [llave], where, _count: true })) as unknown as Array<
      Record<LlaveCatalogo, string> & { _count: number }
    >;
    return new Map(filas.map((c) => [c[llave], c._count]));
  };
  const [total, sede] = await Promise.all([
    contar(deEstas),
    contar({ ...deEstas, ...ACTIVOS_VIGENTES, ...whereSede }),
  ]);
  return opciones.map((o) => ({ ...o, enUso: total.get(o.id) ?? 0, enSede: sede.get(o.id) ?? 0 }));
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

/** Renombra una opcion: los equipos la referencian por su llave, asi que todos muestran el nombre nuevo. */
export async function renombrarOpcion(clave: ClaveCatalogo, id: string, nombreEscrito: string, usuario?: string | null) {
  const nombre = clave === 'marcas' ? nombreDeMarca(nombreEscrito) : nombreEscrito;
  const { llave, etiqueta } = CATALOGOS[clave];
  const actual = await tabla(prisma, clave).findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Opción no encontrada');

  const repetida = await tabla(prisma, clave).findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, NOT: { id } },
  });
  if (repetida) throw errorRepetido('nombre', `Ya existe la opción "${repetida.nombre}"`);

  const [opcion, activos] = await Promise.all([
    tabla(prisma, clave).update({ where: { id }, data: { nombre } }),
    prisma.asset.count({ where: { [llave]: id } as Prisma.AssetWhereInput }),
  ]);

  await auditLogService.registrarActualizacion(
    'catalogo',
    id,
    `${etiqueta}: opción renombrada "${actual.nombre}" → "${nombre}"${activos ? ` (la usan ${activos} activo(s))` : ''}`,
    { catalogo: etiqueta, nombre: actual.nombre },
    { catalogo: etiqueta, nombre, activosQueLaUsan: activos },
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
  const { etiqueta, llave } = CATALOGOS[clave];
  const actual = await tabla(prisma, clave).findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Opción no encontrada');

  const enUso = await prisma.asset.count({ where: { [llave]: id } as Prisma.AssetWhereInput });
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

type NombresCatalogo = Partial<Record<CampoCatalogo, string | null | undefined>>;
type IdsCatalogo = Partial<Record<LlaveCatalogo, string | null>>;

/**
 * Traduce los nombres que llegan al crear o editar un equipo (marca, sistema
 * operativo, antivirus, licencia) a la llave de su opcion (SPEC 2.168). Es el
 * unico paso por el que un equipo toma una opcion de catalogo.
 * - Un campo que no viene (undefined) no se toca; vacio o null lo deja sin valor.
 * - Se busca sin importar mayusculas. Si no existe, error en ese campo.
 * - Una opcion desactivada solo se acepta si el equipo ya la tiene (`actual`)
 *   o si son datos historicos (`aceptarDesactivadas`, la importacion).
 */
export async function idsDeCatalogos(
  tx: Prisma.TransactionClient,
  datos: NombresCatalogo,
  { actual = {}, aceptarDesactivadas = false }: { actual?: IdsCatalogo; aceptarDesactivadas?: boolean } = {}
): Promise<IdsCatalogo> {
  const ids: IdsCatalogo = {};
  for (const campo of NOMBRES_CAMPOS_CATALOGO) {
    const escrito = datos[campo];
    if (escrito === undefined) continue;
    const { llave, catalogo, etiqueta } = CAMPOS_CATALOGO[campo];
    const nombre = escrito?.trim();
    if (!nombre) {
      ids[llave] = null;
      continue;
    }
    const opcion = await tabla(tx, catalogo).findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
    if (!opcion) throw errorDeCampo(campo, `${etiqueta} "${nombre}" no está en su catálogo: elígela de la lista`);
    if (!opcion.activo && !aceptarDesactivadas && opcion.id !== actual[llave]) {
      throw errorDeCampo(campo, `${etiqueta} "${opcion.nombre}" está desactivada: elige otra o actívala en Catálogos`);
    }
    ids[llave] = opcion.id;
  }
  return ids;
}
