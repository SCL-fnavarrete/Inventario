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

/**
 * Fija la unica sesion vigente de la cuenta (SPEC 2.127): la nueva al iniciar
 * sesion, o null cuando un administrador la cierra. Las demas quedan fuera en
 * su siguiente accion. Devuelve la que estaba vigente antes.
 */
export async function fijarSesionVigente(id: string, sesionId: string | null) {
  const [antes] = await prisma.$queryRaw<{ sesion_vigente_id: string | null }[]>`
    UPDATE system_users AS nuevo SET sesion_vigente_id = ${sesionId}
    FROM (SELECT id, sesion_vigente_id FROM system_users WHERE id = ${id} FOR UPDATE) AS antes
    WHERE nuevo.id = antes.id
    RETURNING antes.sesion_vigente_id`;
  return antes?.sesion_vigente_id ?? null;
}

/** Deja la hora del ultimo ingreso correcto. */
export function anotarIngreso(id: string) {
  return prisma.systemUser.update({ where: { id }, data: { ultimoLogin: new Date() } });
}
