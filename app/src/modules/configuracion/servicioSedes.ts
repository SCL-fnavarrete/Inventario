import { prisma } from '@/shared/prisma';
import { ConflictError, errorRepetido, NotFoundError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { USO_SEDE, usoSedeEnPalabras } from '@/modules/configuracion/consultasSedes';
import type { CrearSedeInput, EditarSedeInput } from '@/modules/configuracion/validacionesSede';

/**
 * Configuracion > Sedes. Solo admin escribe: son datos maestros. Una sede se
 * edita (el nombre) o se elimina si nada la usa; no se desactiva (SPEC 2.170).
 */

/** Dos sedes no pueden llamarse igual (sin importar mayusculas). */
export async function exigirNombreSedeLibre(nombre: string, exceptoId?: string) {
  const repetida = await prisma.sede.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(exceptoId && { NOT: { id: exceptoId } }) },
    select: { id: true },
  });
  if (repetida) throw errorRepetido('nombre', 'Ya existe una sede con ese nombre');
}

/** Con `conUso`, cuanto la usa cada una (para saber si se puede eliminar). */
export function listarSedes({ conUso = false } = {}) {
  return prisma.sede.findMany({
    orderBy: { nombre: 'asc' },
    ...(conUso && { include: USO_SEDE }),
  });
}

export async function crearSede({ codigo, nombre }: CrearSedeInput, usuario: string | null | undefined) {
  if (await prisma.sede.findUnique({ where: { codigo } })) {
    throw errorRepetido('codigo', 'Ya existe una sede con ese código');
  }
  await exigirNombreSedeLibre(nombre);
  const sede = await prisma.sede.create({ data: { codigo, nombre } });
  await auditLogService.registrarCreacion(
    'sede',
    sede.id,
    `Sede creada: ${sede.nombre} (${sede.codigo})`,
    { codigo: sede.codigo, nombre: sede.nombre },
    usuario
  );
  return sede;
}

/** Editar el nombre. El codigo no se edita a proposito: es la referencia estable de la sede. */
export async function editarSede(id: string, { nombre }: EditarSedeInput, usuario: string | null | undefined) {
  const existente = await prisma.sede.findUnique({ where: { id } });
  if (!existente) throw new NotFoundError('Sede no encontrada');
  await exigirNombreSedeLibre(nombre, id);
  const sede = await prisma.sede.update({ where: { id }, data: { nombre } });
  await auditLogService.registrarActualizacion(
    'sede',
    sede.id,
    `Sede actualizada: ${sede.nombre} (${sede.codigo})`,
    { nombre: existente.nombre },
    { nombre: sede.nombre },
    usuario
  );
  return sede;
}

/**
 * Elimina una sede que nada usa (SPEC 2.170). La fila de la sede queda
 * bloqueada mientras se cuenta: lo que se cree en ella al mismo tiempo espera
 * y falla al no encontrarla, en vez de quedar sin sede.
 */
export async function eliminarSede(id: string, usuario: string | null | undefined) {
  return prisma.$transaction(async (tx) => {
    const bloqueada = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sedes WHERE id = ${id} FOR UPDATE`;
    if (bloqueada.length === 0) throw new NotFoundError('Sede no encontrada');
    const sede = await tx.sede.findUniqueOrThrow({ where: { id }, include: USO_SEDE });
    const uso = usoSedeEnPalabras(sede._count);
    if (uso) throw new ConflictError(`No se puede eliminar ${sede.nombre}: la usan ${uso}.`);
    await tx.sede.delete({ where: { id } });
    await auditLogService.registrarEliminacion(
      'sede',
      sede.id,
      `Sede eliminada: ${sede.nombre} (${sede.codigo})`,
      { codigo: sede.codigo, nombre: sede.nombre },
      usuario,
      tx
    );
    return { id };
  });
}
