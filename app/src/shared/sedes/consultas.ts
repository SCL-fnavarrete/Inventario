import { prisma } from '@/shared/prisma';
import { errorDeCampo } from '@/shared/errores';

/**
 * Reglas de sedes compartidas por Configuracion > Sedes y > Usuarios
 * (SPEC 2.112.6).
 */

/**
 * Un usuario solo se asigna a una sede que existe y esta activa. Desde la
 * auditoria del 27-sep-2026 (2.9) tambien lo exige todo lo que NACE en una
 * sede: alta de activos, articulos de Kit, importaciones y onboarding. Lo que
 * saca cosas de una sede desactivada (guias, desvinculaciones, cambios de
 * equipo) no pasa por aqui: la sede puede tener aun personas y equipos.
 */
export async function exigirSedeActiva(sedeId: string) {
  const sede = await prisma.sede.findUnique({ where: { id: sedeId }, select: { activa: true } });
  if (!sede) throw errorDeCampo('sedeId', 'La sede elegida no existe');
  if (!sede.activa) throw errorDeCampo('sedeId', 'La sede elegida está desactivada');
}
