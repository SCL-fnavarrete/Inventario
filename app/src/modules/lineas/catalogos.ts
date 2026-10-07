import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, NotFoundError, errorRepetido } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import type { CatalogoLinea, DatosOpcionLinea } from '@/modules/lineas/validaciones';

/**
 * Catalogos de las lineas (SPEC 2.131): planes (con precio de referencia),
 * tipos de chip y operadores se pueden agregar, renombrar y quitar; los estados son cuatro y
 * fijos (Activa, Suspendida, En portabilidad, Por confirmar, Dada de baja): solo se leen. La
 * linea apunta por id: renombrar no toca las lineas y una opcion ya usada se
 * desactiva en vez de borrarse.
 */
// `uso`: la relacion que cuenta donde se usa cada opcion (lineas, o tramos de tenencia).
const CATALOGOS = {
  planes: { modelo: 'planLinea', etiqueta: 'Plan de línea', uso: 'lineas' },
  estados: { modelo: 'estadoLinea', etiqueta: 'Estado de línea', uso: 'lineas' },
  'tipos-chip': { modelo: 'tipoChip', etiqueta: 'Tipo de chip', uso: 'lineas' },
  operadores: { modelo: 'operadorLinea', etiqueta: 'Operador de línea', uso: 'lineas' },
  motivos: { modelo: 'motivoReasignacion', etiqueta: 'Motivo de reasignación', uso: 'tenencias' },
} as const;

type Opcion = {
  id: string;
  nombre: string;
  activo: boolean;
  precioMensual?: number | null;
  deBaja?: boolean;
  sinCelular?: boolean;
  clave?: string | null;
  _count?: Record<string, number>;
};

/** Lo comun de las tres tablas (id, nombre unico, activo y sus lineas). */
interface TablaOpciones {
  findMany(args: object): Promise<Opcion[]>;
  findFirst(args: object): Promise<Opcion | null>;
  findUnique(args: object): Promise<Opcion | null>;
  create(args: object): Promise<Opcion>;
  update(args: object): Promise<Opcion>;
  delete(args: object): Promise<Opcion>;
}

const tabla = (cliente: Prisma.TransactionClient, catalogo: CatalogoLinea) =>
  cliente[CATALOGOS[catalogo].modelo] as unknown as TablaOpciones;

/** Los estados no se tocan: son los del ciclo de vida de una linea. */
function exigirEditable(catalogo: CatalogoLinea) {
  if (catalogo === 'estados') {
    throw new ConflictError('Los estados de una línea son fijos: Activa, Suspendida, En portabilidad, Por confirmar y Dada de baja');
  }
}

/** El dato propio de cada catalogo: el precio de referencia de un plan; en un tipo de chip, si va sin celular. */
function extras(catalogo: CatalogoLinea, datos: DatosOpcionLinea) {
  if (catalogo === 'planes' && datos.precioMensual !== undefined) return { precioMensual: datos.precioMensual };
  if (catalogo === 'tipos-chip' && datos.sinCelular !== undefined) return { sinCelular: datos.sinCelular };
  return {};
}

/** Datos de una opcion para la auditoria. */
const foto = (catalogo: CatalogoLinea, o: Opcion) => ({
  catalogo: CATALOGOS[catalogo].etiqueta,
  nombre: o.nombre,
  ...(o.precioMensual !== undefined && { precioMensual: o.precioMensual }),
  ...(o.sinCelular !== undefined && { sinCelular: o.sinCelular }),
});

/**
 * Opciones del catalogo. Con `conUso`, cuantas lineas tiene cada una (las
 * lineas no son de una sede: enUso y enSede son lo mismo, forma de
 * OpcionesCatalogo). `protegido`: la usa el sistema y no se elimina.
 */
export async function listarOpcionesLinea(catalogo: CatalogoLinea, { soloActivas = false, conUso = false } = {}) {
  const opciones = await tabla(prisma, catalogo).findMany({
    where: soloActivas ? { activo: true } : undefined,
    orderBy: { nombre: 'asc' },
    ...(conUso && { include: { _count: { select: { [CATALOGOS[catalogo].uso]: true } } } }),
  });
  return opciones.map(({ _count, ...o }) => ({
    ...o,
    protegido: !!o.clave,
    ...(_count && { enUso: _count[CATALOGOS[catalogo].uso], enSede: _count[CATALOGOS[catalogo].uso] }),
  }));
}

/** Crea una opcion; si ya existe (sin importar mayusculas) la reactiva. */
export async function crearOpcionLinea(catalogo: CatalogoLinea, datos: DatosOpcionLinea, usuario?: string | null) {
  exigirEditable(catalogo);
  const t = tabla(prisma, catalogo);
  const existente = await t.findFirst({ where: { nombre: { equals: datos.nombre, mode: 'insensitive' } } });
  if (existente?.activo) return { opcion: existente, creada: false };
  const opcion = existente
    ? await t.update({ where: { id: existente.id }, data: { activo: true } })
    : await t.create({ data: { nombre: datos.nombre, ...extras(catalogo, datos) } });
  await auditLogService.registrarCreacion(
    'catalogo',
    opcion.id,
    `${CATALOGOS[catalogo].etiqueta}: "${opcion.nombre}" ${existente ? 'reactivado' : 'creado'}`,
    foto(catalogo, opcion),
    usuario
  );
  return { opcion, creada: !existente };
}

/** Renombra y cambia el precio del plan. Las lineas apuntan por id. */
export async function editarOpcionLinea(
  catalogo: CatalogoLinea,
  id: string,
  datos: DatosOpcionLinea,
  usuario?: string | null
) {
  exigirEditable(catalogo);
  const t = tabla(prisma, catalogo);
  const actual = await t.findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Opción no encontrada');
  const repetido = await t.findFirst({ where: { nombre: { equals: datos.nombre, mode: 'insensitive' }, NOT: { id } } });
  if (repetido) throw errorRepetido('nombre', `Ya existe "${repetido.nombre}"`);
  const opcion = await t.update({ where: { id }, data: { nombre: datos.nombre, ...extras(catalogo, datos) } });
  await auditLogService.registrarActualizacion(
    'catalogo',
    id,
    `${CATALOGOS[catalogo].etiqueta}: "${actual.nombre}" editado`,
    foto(catalogo, actual),
    foto(catalogo, opcion),
    usuario
  );
  return opcion;
}

/** Elimina una opcion sin lineas; una ya usada solo se desactiva. */
export async function eliminarOpcionLinea(catalogo: CatalogoLinea, id: string, usuario?: string | null) {
  exigirEditable(catalogo);
  const t = tabla(prisma, catalogo);
  const uso = CATALOGOS[catalogo].uso;
  const actual = await t.findUnique({ where: { id }, include: { _count: { select: { [uso]: true } } } });
  if (!actual) throw new NotFoundError('Opción no encontrada');
  const desactivado = (actual._count?.[uso] ?? 0) > 0;
  if (desactivado) await t.update({ where: { id }, data: { activo: false } });
  else await t.delete({ where: { id } });
  await auditLogService.registrarEliminacion(
    'catalogo',
    id,
    `${CATALOGOS[catalogo].etiqueta}: "${actual.nombre}" ${desactivado ? `desactivado (${uso === 'lineas' ? 'tiene líneas' : 'tiene reasignaciones'})` : 'eliminado'}`,
    foto(catalogo, actual),
    usuario
  );
  return { desactivado };
}

/** Estado que usa el sistema por su clave ("activa" o "baja"). */
export async function estadoPorClave(cliente: Prisma.TransactionClient, clave: 'activa' | 'baja') {
  const estado = await cliente.estadoLinea.findUnique({ where: { clave } });
  if (!estado) throw new ConflictError(`Falta el estado de línea del sistema "${clave}"`);
  return estado;
}
