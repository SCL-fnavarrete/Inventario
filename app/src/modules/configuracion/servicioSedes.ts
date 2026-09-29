import { prisma } from '@/shared/prisma';
import { errorRepetido, NotFoundError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import { USO_SEDE } from '@/modules/configuracion/consultasSedes';
import type { CrearSedeInput, EditarSedeInput } from '@/modules/configuracion/validacionesSede';

/**
 * Configuracion > Sedes. Solo admin escribe: son datos maestros. Una sede no
 * se borra: se desactiva (deja fuera a sus tecnicos, SPEC 2.112.6).
 */

/** Dos sedes no pueden llamarse igual (sin importar mayusculas). */
export async function exigirNombreSedeLibre(nombre: string, exceptoId?: string) {
  const repetida = await prisma.sede.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, ...(exceptoId && { NOT: { id: exceptoId } }) },
    select: { id: true },
  });
  if (repetida) throw errorRepetido('nombre', 'Ya existe una sede con ese nombre');
}

/** Con `conUso`, cuantos tecnicos activos y equipos tiene cada una, para avisar antes de desactivarla. */
export function listarSedes({ soloActivas = false, conUso = false } = {}) {
  return prisma.sede.findMany({
    where: soloActivas ? { activa: true } : undefined,
    orderBy: { nombre: 'asc' },
    ...(conUso && { include: USO_SEDE }),
  });
}

export async function crearSede({ codigo, nombre, activa }: CrearSedeInput, usuario: string | null | undefined) {
  if (await prisma.sede.findUnique({ where: { codigo } })) {
    throw errorRepetido('codigo', 'Ya existe una sede con ese código');
  }
  await exigirNombreSedeLibre(nombre);
  const sede = await prisma.sede.create({ data: { codigo, nombre, activa: activa ?? true } });
  await auditLogService.registrarCreacion(
    'sede',
    sede.id,
    `Sede creada: ${sede.nombre} (${sede.codigo})`,
    { codigo: sede.codigo, nombre: sede.nombre, activa: sede.activa },
    usuario
  );
  return sede;
}

/**
 * Editar el nombre o activar/desactivar. El codigo no se edita a proposito:
 * es la referencia estable que pueden usar integraciones y reportes.
 */
export async function editarSede(id: string, { nombre, activa }: EditarSedeInput, usuario: string | null | undefined) {
  const existente = await prisma.sede.findUnique({ where: { id } });
  if (!existente) throw new NotFoundError('Sede no encontrada');
  if (nombre !== undefined) await exigirNombreSedeLibre(nombre, id);
  const sede = await prisma.sede.update({
    where: { id },
    data: { ...(nombre !== undefined && { nombre }), ...(activa !== undefined && { activa }) },
  });
  await auditLogService.registrarActualizacion(
    'sede',
    sede.id,
    existente.activa !== sede.activa
      ? `Sede ${sede.activa ? 'activada' : 'desactivada'}: ${sede.nombre} (${sede.codigo})`
      : `Sede actualizada: ${sede.nombre} (${sede.codigo})`,
    { nombre: existente.nombre, activa: existente.activa },
    { nombre: sede.nombre, activa: sede.activa },
    usuario
  );
  return sede;
}
