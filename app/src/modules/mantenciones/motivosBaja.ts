import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, NotFoundError, ValidationError, errorRepetido } from '@/shared/errores';
import { auditLogService } from '@/shared/auditoria';
import type { PrismaTx } from '@/modules/activos/servidor';

/**
 * Motivos de baja (SPEC 2.116.5): lista administrable en Configuracion >
 * Catalogos de Activos. A diferencia de las opciones del activo (marca,
 * sistema operativo...), la mantencion de baja apunta al motivo por su id:
 * renombrar no toca las bajas y un motivo usado no se borra, se desactiva.
 * "Extravío" y "Otro" tienen `clave` porque los usa el sistema: se pueden
 * renombrar, pero no desactivar ni eliminar.
 */

const ETIQUETA = 'Motivo de baja';

/** Motivos; con `conUso`, cuantas bajas tiene cada uno (todas y las de la sede). */
export async function listarMotivosBaja({
  soloActivos = false,
  conUso = false,
  whereSede = {} as Prisma.AssetWhereInput,
} = {}) {
  const motivos = await prisma.motivoBaja.findMany({
    where: soloActivos ? { activo: true } : undefined,
    orderBy: { nombre: 'asc' },
    select: { id: true, nombre: true, activo: true, clave: true },
  });
  const conProtegido = motivos.map((m) => ({ ...m, protegido: !!m.clave }));
  if (!conUso || motivos.length === 0) return conProtegido;

  // Las bajas por Mantenciones y las directas de un cambio de equipo, que
  // guardan el motivo en la devolucion (SPEC 2.126).
  const contar = async (asset: Prisma.AssetWhereInput) => {
    const [enMantenciones, enDevoluciones] = await Promise.all([
      prisma.maintenance.groupBy({ by: ['motivoBajaId'], where: { motivoBajaId: { not: null }, asset }, _count: true }),
      prisma.assignment.groupBy({ by: ['motivoBajaId'], where: { motivoBajaId: { not: null }, asset }, _count: true }),
    ]);
    const cuenta = new Map<string | null, number>();
    for (const f of [...enMantenciones, ...enDevoluciones]) cuenta.set(f.motivoBajaId, (cuenta.get(f.motivoBajaId) ?? 0) + f._count);
    return cuenta;
  };
  const [total, sede] = await Promise.all([contar({}), contar(whereSede)]);
  return conProtegido.map((m) => ({ ...m, enUso: total.get(m.id) ?? 0, enSede: sede.get(m.id) ?? 0 }));
}

/** Crea un motivo; si ya existe (sin importar mayusculas) lo reactiva. */
export async function crearMotivoBaja(nombre: string, usuario?: string | null) {
  const existente = await prisma.motivoBaja.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' } },
  });
  if (existente?.activo) return { opcion: existente, creada: false };

  const opcion = existente
    ? await prisma.motivoBaja.update({ where: { id: existente.id }, data: { activo: true } })
    : await prisma.motivoBaja.create({ data: { nombre } });
  await auditLogService.registrarCreacion(
    'catalogo',
    opcion.id,
    `${ETIQUETA}: "${opcion.nombre}" ${existente ? 'reactivado' : 'creado'}`,
    { catalogo: ETIQUETA, nombre: opcion.nombre },
    usuario
  );
  return { opcion, creada: !existente };
}

/** Renombra un motivo. Las bajas apuntan por id: quedan con el nombre nuevo. */
export async function renombrarMotivoBaja(id: string, nombre: string, usuario?: string | null) {
  const actual = await prisma.motivoBaja.findUnique({ where: { id } });
  if (!actual) throw new NotFoundError('Motivo no encontrado');
  const repetido = await prisma.motivoBaja.findFirst({
    where: { nombre: { equals: nombre, mode: 'insensitive' }, NOT: { id } },
  });
  if (repetido) throw errorRepetido('nombre', `Ya existe el motivo "${repetido.nombre}"`);

  const opcion = await prisma.motivoBaja.update({ where: { id }, data: { nombre } });
  await auditLogService.registrarActualizacion(
    'catalogo',
    id,
    `${ETIQUETA}: renombrado "${actual.nombre}" → "${nombre}"`,
    { catalogo: ETIQUETA, nombre: actual.nombre },
    { catalogo: ETIQUETA, nombre },
    usuario
  );
  return opcion;
}

/**
 * Elimina un motivo sin bajas; uno ya usado solo se desactiva (sus bajas son
 * evidencia de auditoria). Los del sistema no se tocan.
 */
export async function eliminarMotivoBaja(id: string, usuario?: string | null) {
  const actual = await prisma.motivoBaja.findUnique({
    where: { id },
    include: { _count: { select: { maintenances: true, assignments: true } } },
  });
  if (!actual) throw new NotFoundError('Motivo no encontrado');
  if (actual.clave) {
    throw new ConflictError(`"${actual.nombre}" lo usa el sistema: se puede renombrar, pero no eliminar`);
  }

  const desactivado = actual._count.maintenances + actual._count.assignments > 0;
  if (desactivado) {
    await prisma.motivoBaja.update({ where: { id }, data: { activo: false } });
  } else {
    await prisma.motivoBaja.delete({ where: { id } });
  }
  await auditLogService.registrarEliminacion(
    'catalogo',
    id,
    `${ETIQUETA}: "${actual.nombre}" ${desactivado ? 'desactivado (tiene bajas)' : 'eliminado'}`,
    { catalogo: ETIQUETA, nombre: actual.nombre },
    usuario
  );
  return { desactivado };
}

/**
 * Motivo de una baja, elegido por id (formularios) o por clave (el equipo
 * perdido en un despacho usa "extravio"). Devuelve el id que se guarda y el
 * texto que se muestra: "Robo" o "Robo: detalle". "Otro" exige el detalle.
 */
export async function motivoParaBaja(
  cliente: PrismaTx,
  motivo: { id: string } | { clave: string },
  detalle?: string | null
) {
  const elegido = await cliente.motivoBaja.findFirst({ where: { ...motivo, activo: true } });
  if (!elegido) {
    const mensaje = 'Elige un motivo de baja de la lista';
    throw new ValidationError(mensaje, [{ field: 'motivoBajaId', message: mensaje }]);
  }
  const texto = detalle?.trim();
  if (elegido.clave === 'otro' && !texto) {
    const mensaje = 'Describe el motivo cuando eliges "Otro"';
    throw new ValidationError(mensaje, [{ field: 'motivoDetalle', message: mensaje }]);
  }
  return { motivoBajaId: elegido.id, motivoTexto: texto ? `${elegido.nombre}: ${texto}` : elegido.nombre };
}
