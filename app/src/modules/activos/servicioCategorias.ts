import type { AssetCategory } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, errorRepetido, NotFoundError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { filtroSede } from '@/shared/sedes/filtro';
import { ACTIVOS_VIGENTES } from '@/modules/activos/consultas';
import type { CategoriaInput } from '@/modules/activos/validacionesCategoria';

/** Dos categorias no pueden llamarse igual (sin importar mayusculas). */
export async function exigirNombreCategoriaLibre(nombre: string, exceptoId?: string) {
  const repetida = await prisma.assetCategory.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(exceptoId && { NOT: { id: exceptoId } }) },
    select: { id: true },
  });
  if (repetida) throw errorRepetido('nombre', 'Ya existe una categoría con ese nombre');
}

/** Lo que se guarda de una categoria en la auditoria. */
export function snapshotCategoria(c: AssetCategory) {
  return {
    nombre: c.nombre,
    descripcion: c.descripcion,
    stockMinimo: c.stockMinimo,
    tipoFicha: c.tipoFicha,
  };
}

/**
 * Categorias en orden alfabetico. Con `conConteo`, `_count.assets` es el total
 * de todas las sedes (decide si se puede eliminar) y `activosSede` los
 * vigentes de la sede del navbar (SPEC 2.116.3).
 */
export async function listarCategorias({ conConteo = false, sedeId = null as string | null } = {}) {
  if (!conConteo) return prisma.assetCategory.findMany({ orderBy: { nombre: 'asc' } });
  const [categorias, porSede] = await Promise.all([
    prisma.assetCategory.findMany({
      orderBy: { nombre: 'asc' },
      include: { _count: { select: { assets: true } } },
    }),
    prisma.asset.groupBy({
      by: ['categoriaId'],
      where: { ...ACTIVOS_VIGENTES, ...filtroSede(sedeId) },
      _count: true,
    }),
  ]);
  const enSede = new Map(porSede.map((c) => [c.categoriaId, c._count]));
  return categorias.map((c) => ({ ...c, activosSede: enSede.get(c.id) ?? 0 }));
}

export async function obtenerCategoria(id: string) {
  const categoria = await prisma.assetCategory.findUnique({
    where: { id },
    include: { _count: { select: { assets: true } } },
  });
  if (!categoria) throw new NotFoundError('Categoría no encontrada');
  return categoria;
}

export async function crearCategoria(datos: CategoriaInput, usuario: string | null | undefined) {
  await exigirNombreCategoriaLibre(datos.nombre);
  const categoria = await prisma.assetCategory.create({
    data: {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      stockMinimo: datos.stockMinimo ?? 3,
      tipoFicha: datos.tipoFicha ?? 'generico',
    },
  });
  await auditLogService.registrarCreacion(
    'categoria',
    categoria.id,
    `Categoría creada: ${categoria.nombre}`,
    snapshotCategoria(categoria),
    usuario
  );
  return categoria;
}

/** Todo lo que cambia queda en la auditoria, tambien "Que campos pide" (SPEC 2.112.7). */
export async function editarCategoria(id: string, datos: CategoriaInput, usuario: string | null | undefined) {
  const existente = await prisma.assetCategory.findUnique({ where: { id } });
  if (!existente) throw new NotFoundError('Categoría no encontrada');
  await exigirNombreCategoriaLibre(datos.nombre, id);
  const categoria = await prisma.assetCategory.update({
    where: { id },
    data: {
      nombre: datos.nombre,
      descripcion: datos.descripcion,
      stockMinimo: datos.stockMinimo ?? existente.stockMinimo,
      tipoFicha: datos.tipoFicha ?? existente.tipoFicha,
    },
  });
  await auditLogService.registrarActualizacion(
    'categoria',
    categoria.id,
    `Categoría actualizada: ${categoria.nombre}`,
    snapshotCategoria(existente),
    snapshotCategoria(categoria),
    usuario
  );
  return categoria;
}

/** Una categoria con activos no se elimina: esos activos quedarian sin categoria. */
export async function eliminarCategoria(id: string, usuario: string | null | undefined) {
  const existente = await obtenerCategoria(id);
  if (existente._count.assets > 0) {
    throw new ConflictError(
      `No se puede eliminar: la categoría tiene ${existente._count.assets} activo(s). Cambia su categoría primero.`
    );
  }
  await prisma.assetCategory.delete({ where: { id } });
  await auditLogService.registrarEliminacion(
    'categoria',
    existente.id,
    `Categoría eliminada: ${existente.nombre}`,
    snapshotCategoria(existente),
    usuario
  );
}

/** Categoria por nombre, sin importar mayusculas (la importacion la busca asi). */
export function buscarCategoriaPorNombre(nombre: string) {
  return prisma.assetCategory.findFirst({ where: { nombre: { equals: nombre, mode: 'insensitive' } } });
}

/**
 * Categoria de una tanda importada: la que tiene ese nombre o, si no existe,
 * una nueva con ese nombre.
 */
export async function categoriaParaImportar(nombre: string) {
  return (
    (await buscarCategoriaPorNombre(nombre)) ??
    prisma.assetCategory.create({
      data: { nombre: nombre.charAt(0).toUpperCase() + nombre.slice(1), descripcion: `Categoría ${nombre}` },
    })
  );
}
