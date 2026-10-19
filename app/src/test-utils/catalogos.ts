import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';

/**
 * Crea un equipo directo en la base de pruebas con la marca por su nombre
 * (SPEC 2.168): el equipo la referencia por su llave, asi que se usa la del
 * catalogo con ese nombre o se crea si no existe.
 *
 *   await crearEquipo({ categoriaId, marca: 'Dell', modelo: 'Latitude', estado: 'disponible' })
 */
export async function crearEquipo({
  marca,
  ...datos
}: Omit<Prisma.AssetUncheckedCreateInput, 'marcaId'> & { marca: string }) {
  const { id } = await prisma.marca.upsert({
    where: { nombre: marca },
    update: {},
    create: { nombre: marca },
  });
  return prisma.asset.create({ data: { ...datos, marcaId: id } });
}
