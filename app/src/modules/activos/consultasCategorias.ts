import type { AssetCategory } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { errorRepetido } from '@/shared/errores';

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
