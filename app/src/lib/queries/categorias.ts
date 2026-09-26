import type { AssetCategory } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { errorRepetido } from '@/lib/errors';

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
    requiereSerie: c.requiereSerie,
    requiereImei: c.requiereImei,
    stockMinimo: c.stockMinimo,
    tipoFicha: c.tipoFicha,
  };
}
