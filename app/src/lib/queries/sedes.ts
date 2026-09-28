import { prisma } from '@/lib/prisma';
import { errorDeCampo, errorRepetido } from '@/lib/errors';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

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

/** Dos sedes no pueden llamarse igual (sin importar mayusculas). */
export async function exigirNombreSedeLibre(nombre: string, exceptoId?: string) {
  const repetida = await prisma.sede.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(exceptoId && { NOT: { id: exceptoId } }) },
    select: { id: true },
  });
  if (repetida) throw errorRepetido('nombre', 'Ya existe una sede con ese nombre');
}

/**
 * Lo que tiene cada sede, para avisar antes de desactivarla: tecnicos
 * activos (no podran entrar) y equipos vigentes.
 */
export const USO_SEDE = {
  _count: {
    select: {
      usuarios: { where: { activo: true } },
      assets: { where: ACTIVOS_VIGENTES },
    },
  },
} as const;
