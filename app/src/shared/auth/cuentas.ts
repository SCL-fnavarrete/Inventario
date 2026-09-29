import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';

/**
 * Cuentas de usuario del sistema (SPEC 2.118): las escribe solo el inicio de
 * sesion y, por medio de estas funciones, Configuracion > Usuarios, que pone
 * las reglas (ultimo administrador, sede activa...).
 */

export function crearCuenta<S extends Prisma.SystemUserSelect>(
  datos: Prisma.SystemUserUncheckedCreateInput,
  select: S
) {
  return prisma.systemUser.create({ data: datos, select });
}

export function actualizarCuenta<S extends Prisma.SystemUserSelect>(
  tx: Prisma.TransactionClient,
  id: string,
  datos: Prisma.SystemUserUpdateInput,
  select: S
) {
  return tx.systemUser.update({ where: { id }, data: datos, select });
}

/** Deja la hora del ultimo ingreso correcto. */
export function anotarIngreso(id: string) {
  return prisma.systemUser.update({ where: { id }, data: { ultimoLogin: new Date() } });
}
