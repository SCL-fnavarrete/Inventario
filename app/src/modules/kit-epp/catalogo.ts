import { prisma } from '@/shared/prisma';
import { errorRepetido, NotFoundError, ValidationError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { filtroSede, sedeIdParaCrear } from '@/shared/sedes/filtro';
import { exigirSedeActiva } from '@/shared/sedes/consultas';
import type { CreateKitItemInput, UpdateKitItemInput } from '@/modules/kit-epp/validaciones';

/**
 * Catalogo de articulos de Kit de Bienvenida y EPP, con su stock. Es por sede
 * (cada sede tiene el suyo) y la sede del navbar filtra (SPEC 2.117).
 */

export function listarArticulosKit(p: { categoria: string | null; sedeId: string }) {
  return prisma.welcomeKitItem.findMany({
    where: {
      ...(p.categoria ? { categoria: p.categoria as 'kit_bienvenida' | 'epp' } : {}),
      ...filtroSede(p.sedeId),
    },
    // El nombre de la sede, para la lista con varias sedes mezcladas.
    include: { sede: { select: { nombre: true } } },
    orderBy: { nombre: 'asc' },
  });
}

/**
 * Crear un articulo. La sede es obligatoria (sin sede no aparece al filtrar)
 * y el nombre no se repite en la misma sede y categoria; dos sedes si pueden
 * tener uno igual: son catalogos independientes.
 */
export async function crearArticuloKit(datos: CreateKitItemInput, usuario: string | null | undefined) {
  const sedeId = sedeIdParaCrear(datos.sedeId, { requerido: true });
  if (sedeId) await exigirSedeActiva(sedeId);
  const repetido = await prisma.welcomeKitItem.findFirst({
    where: { nombre: { equals: datos.nombre, mode: 'insensitive' }, categoria: datos.categoria, sedeId },
  });
  if (repetido) {
    throw errorRepetido('nombre', 'Ya existe un artículo con ese nombre en esta categoría para esta sede');
  }
  const item = await prisma.welcomeKitItem.create({
    data: {
      nombre: datos.nombre.trim(),
      categoria: datos.categoria,
      cantidad: datos.cantidad,
      stockMinimo: datos.stockMinimo,
      sedeId,
    },
  });
  await auditLogService.registrarCreacion(
    'kit_item',
    item.id,
    `Artículo de Kit/EPP creado: ${item.nombre} (${item.categoria})`,
    { nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad, sedeId: item.sedeId },
    usuario
  );
  return item;
}

export async function editarArticuloKit(id: string, datos: UpdateKitItemInput, usuario: string | null | undefined) {
  const item = await prisma.welcomeKitItem.findUnique({ where: { id } });
  if (!item) throw new NotFoundError('Artículo no encontrado');
  const actualizado = await prisma.welcomeKitItem.update({
    where: { id },
    data: {
      ...(datos.nombre !== undefined && { nombre: datos.nombre.trim() }),
      ...(datos.categoria !== undefined && { categoria: datos.categoria }),
      ...(datos.cantidad !== undefined && { cantidad: datos.cantidad }),
      ...(datos.stockMinimo !== undefined && { stockMinimo: datos.stockMinimo }),
    },
  });
  await auditLogService.registrarActualizacion(
    'kit_item',
    actualizado.id,
    `Artículo de Kit/EPP actualizado: ${actualizado.nombre}`,
    { nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad },
    { nombre: actualizado.nombre, categoria: actualizado.categoria, cantidad: actualizado.cantidad },
    usuario
  );
  return actualizado;
}

/** Uno con entregas registradas no se elimina: se deja la cantidad en 0. */
export async function eliminarArticuloKit(id: string, usuario: string | null | undefined) {
  const item = await prisma.welcomeKitItem.findUnique({
    where: { id },
    include: { _count: { select: { kitAssignments: true } } },
  });
  if (!item) throw new NotFoundError('Artículo no encontrado');
  if (item._count.kitAssignments > 0) {
    throw new ValidationError(
      'No se puede eliminar: este artículo ya tiene entregas registradas. Puedes dejar la cantidad en 0 en vez de eliminarlo.'
    );
  }
  await prisma.welcomeKitItem.delete({ where: { id } });
  await auditLogService.registrarEliminacion(
    'kit_item',
    item.id,
    `Artículo de Kit/EPP eliminado: ${item.nombre}`,
    { nombre: item.nombre, categoria: item.categoria, sedeId: item.sedeId },
    usuario
  );
}
