import { prisma } from '@/shared/prisma';
import { errorRepetido, NotFoundError, ValidationError } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import type {
  CreateMaintenanceTypeInput,
  UpdateMaintenanceTypeInput,
} from '@/modules/mantenciones/validacionesTipo';

/**
 * Tipos de mantencion: catalogo global (sin sede, igual que las categorias).
 * Admin y tecnico lo administran (recurso "tiposMantencion"). Un tipo en uso
 * no se borra: se desactiva.
 */

/**
 * Un tipo no puede repetir nombre (sin importar mayusculas). El error marca
 * el campo "nombre". exceptoId: el tipo que se esta editando.
 */
export async function assertNombreTipoLibre(nombre: string, exceptoId?: string) {
  const repetido = await prisma.maintenanceType.findFirst({
    where: {
      nombre: { equals: nombre.trim(), mode: 'insensitive' },
      ...(exceptoId ? { NOT: { id: exceptoId } } : {}),
    },
    select: { id: true },
  });
  if (repetido) throw errorRepetido('nombre', 'Ya existe un tipo de mantención con ese nombre');
}

export function listarTiposMantencion({ soloActivos = false, conConteo = false } = {}) {
  return prisma.maintenanceType.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: { nombre: 'asc' },
    ...(conConteo && { include: { _count: { select: { maintenances: true } } } }),
  });
}

export async function crearTipoMantencion(datos: CreateMaintenanceTypeInput, usuario: string | null | undefined) {
  await assertNombreTipoLibre(datos.nombre);
  const tipo = await prisma.maintenanceType.create({
    data: { nombre: datos.nombre.trim(), descripcion: datos.descripcion?.trim() || null },
  });
  await auditLogService.registrarCreacion(
    'tipo_mantencion',
    tipo.id,
    `Tipo de mantención creado: ${tipo.nombre}`,
    { nombre: tipo.nombre, descripcion: tipo.descripcion },
    usuario
  );
  return tipo;
}

/** Editar o desactivar un tipo. */
export async function editarTipoMantencion(
  id: string,
  datos: UpdateMaintenanceTypeInput,
  usuario: string | null | undefined
) {
  const existente = await prisma.maintenanceType.findUnique({ where: { id } });
  if (!existente) throw new NotFoundError('Tipo de mantención no encontrado');
  if (datos.nombre) await assertNombreTipoLibre(datos.nombre, id);

  const tipo = await prisma.maintenanceType.update({
    where: { id },
    data: {
      nombre: datos.nombre?.trim() ?? existente.nombre,
      descripcion: datos.descripcion !== undefined ? datos.descripcion?.trim() || null : existente.descripcion,
      activo: datos.activo ?? existente.activo,
    },
  });
  await auditLogService.registrarActualizacion(
    'tipo_mantencion',
    tipo.id,
    `Tipo de mantención actualizado: ${tipo.nombre}`,
    { nombre: existente.nombre, descripcion: existente.descripcion, activo: existente.activo },
    { nombre: tipo.nombre, descripcion: tipo.descripcion, activo: tipo.activo },
    usuario
  );
  return tipo;
}

/** Solo se borra si ninguna mantencion lo usa; si no, se sugiere desactivarlo. */
export async function eliminarTipoMantencion(id: string, usuario: string | null | undefined) {
  const existente = await prisma.maintenanceType.findUnique({
    where: { id },
    include: { _count: { select: { maintenances: true } } },
  });
  if (!existente) throw new NotFoundError('Tipo de mantención no encontrado');
  if (existente._count.maintenances > 0) {
    throw new ValidationError(
      'No se puede eliminar: hay mantenciones que usan este tipo. Puedes desactivarlo en vez de eliminarlo.'
    );
  }
  await prisma.maintenanceType.delete({ where: { id } });
  await auditLogService.registrarEliminacion(
    'tipo_mantencion',
    existente.id,
    `Tipo de mantención eliminado: ${existente.nombre}`,
    { nombre: existente.nombre, descripcion: existente.descripcion },
    usuario
  );
}
