import { prisma } from '@/shared/prisma';
import { errorDeCampo } from '@/shared/errores';

/**
 * Lo que nace en una sede (usuario, activo, articulo de Kit, importacion,
 * onboarding) exige que la sede exista: pudo eliminarse mientras se llenaba el
 * formulario. Las sedes no se desactivan (SPEC 2.170).
 */
export async function exigirSedeExistente(sedeId: string) {
  const sede = await prisma.sede.findUnique({ where: { id: sedeId }, select: { id: true } });
  if (!sede) throw errorDeCampo('sedeId', 'La sede elegida no existe');
}
