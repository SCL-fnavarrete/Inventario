import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError, ValidationError } from '@/shared/errores';
import { filtroSede } from '@/shared/sedes/filtro';
import { coincideBusqueda } from '@/shared/utilidades/text';
import { formatearFecha } from '@/shared/utilidades/fechas';
import { LINEAS_DEL_EQUIPO } from '@/modules/activos';
import { cambiarEstado } from '@/modules/activos/servidor';
import { desdeTenenciaActual, listarLineas } from '@/modules/lineas/servidor';
import { executeAssignment, executeReturn } from '@/modules/asignaciones/ejecucion';
import type {
  AssignmentFilters,
  CreateAssignmentInput,
  ReturnAssignmentInput,
} from '@/modules/asignaciones/validaciones';

/**
 * Asignaciones: equipos entregados a una persona (Activos > Asignaciones).
 * Entregar y devolver usan las mismas funciones que las Solicitudes
 * (executeAssignment y executeReturn), que deciden el estado del equipo.
 */

const CON_EQUIPO_Y_PERSONA = { asset: { include: { categoria: true } }, employee: true } as const;

/**
 * Lista con filtros (GET /api/asignaciones). La sede del navbar filtra por la
 * del equipo (Assignment no tiene sede propia). La busqueda se filtra en
 * memoria: normaliza el RUT e ignora acentos ("juan lenovo" encuentra el
 * Lenovo de Juan).
 */
export async function listarAsignaciones(filters: AssignmentFilters, sedeId: string | null) {
  const skip = (filters.page - 1) * filters.limit;
  const where: Prisma.AssignmentWhereInput = { asset: filtroSede(sedeId) };
  if (filters.employeeId) where.employeeId = filters.employeeId;
  if (filters.assetId) where.assetId = filters.assetId;
  if (filters.activo !== undefined) where.activo = filters.activo;
  if (filters.tipoMovimiento) where.tipoMovimiento = filters.tipoMovimiento;
  if (filters.fechaDesde || filters.fechaHasta) {
    where.fechaEntrega = {};
    if (filters.fechaDesde) where.fechaEntrega.gte = new Date(filters.fechaDesde);
    if (filters.fechaHasta) where.fechaEntrega.lte = new Date(filters.fechaHasta);
  }
  const orderBy = { [filters.sortBy]: filters.sortOrder };

  let data;
  let total;
  const termino = filters.search?.trim() ?? '';
  if (termino) {
    const todas = await prisma.assignment.findMany({ where, orderBy, include: CON_EQUIPO_Y_PERSONA });
    const filtradas = todas.filter((a) =>
      coincideBusqueda(termino, {
        rut: a.employee.rut,
        campos: [
          a.employee.nombres,
          a.employee.apellidoPaterno,
          a.employee.apellidoMaterno,
          a.asset.numeroSerie,
          a.asset.imei,
          a.asset.marca,
          a.asset.modelo,
        ],
      })
    );
    total = filtradas.length;
    data = filtradas.slice(skip, skip + filters.limit);
  } else {
    [data, total] = await Promise.all([
      prisma.assignment.findMany({ where, skip, take: filters.limit, orderBy, include: CON_EQUIPO_Y_PERSONA }),
      prisma.assignment.count({ where }),
    ]);
  }
  return { data, pagination: { page: filters.page, limit: filters.limit, total, totalPages: Math.ceil(total / filters.limit) } };
}

/**
 * Asignaciones vigentes con las lineas (Activos > Asignaciones, SPEC 2.143): los equipos
 * entregados y, en la misma lista, las lineas que hoy tienen persona (en su celular o
 * eSIM / telefono propio). Una busqueda encuentra equipos y lineas; orden por fecha.
 */
export async function listarAsignacionesConLineas(filters: AssignmentFilters, sedeId: string | null) {
  const termino = filters.search?.trim() ?? '';
  const [equipos, lineas] = await Promise.all([
    listarAsignaciones({ ...filters, activo: true, page: 1, limit: 100000 }, sedeId),
    listarLineas({ asignacion: 'con', estado: 'vigentes', ...(sedeId && { sedeId }) }),
  ]);
  const conPersona = lineas.flatMap((l) => {
    const persona = l.activo ? l.activo.empleadoActual : l.empleado;
    return persona ? [{ linea: l, persona }] : [];
  });
  const encontradas = termino
    ? conPersona.filter(({ linea: l, persona: p }) =>
        coincideBusqueda(termino, {
          rut: p.rut,
          campos: [p.nombres, p.apellidoPaterno, l.numero, l.operador?.nombre, l.tipoChip?.nombre, l.activo?.marca, l.activo?.modelo, l.activo?.imei],
        })
      )
    : conPersona;
  const desde = await desdeTenenciaActual(encontradas.map(({ linea }) => linea.id));
  const filas = [
    ...equipos.data.map((a) => ({ ...a, clase: 'equipo' as const })),
    ...encontradas.map(({ linea: l, persona }) => ({
      clase: 'linea' as const,
      id: l.id,
      fechaEntrega: desde.get(l.id) ?? null,
      linea: { numero: l.numero, operador: l.operador?.nombre ?? null, tipoChip: l.tipoChip?.nombre ?? null },
      activo: l.activo ? { id: l.activo.id, marca: l.activo.marca, modelo: l.activo.modelo } : null,
      employee: { id: persona.id, rut: persona.rut, nombres: persona.nombres, apellidoPaterno: persona.apellidoPaterno },
    })),
  ].sort((a, b) => (b.fechaEntrega ? new Date(b.fechaEntrega).getTime() : 0) - (a.fechaEntrega ? new Date(a.fechaEntrega).getTime() : 0));
  const skip = (filters.page - 1) * filters.limit;
  return {
    data: filas.slice(skip, skip + filters.limit),
    pagination: { page: filters.page, limit: filters.limit, total: filas.length, totalPages: Math.ceil(filas.length / filters.limit) },
  };
}

/** Detalle de una asignacion, con el historial reciente del equipo. */
export async function detalleAsignacion(id: string) {
  const asignacion = await prisma.assignment.findUnique({
    where: { id },
    include: {
      asset: {
        include: { categoria: true, lineas: LINEAS_DEL_EQUIPO, history: { orderBy: { createdAt: 'desc' }, take: 10 } },
      },
      employee: true,
    },
  });
  if (!asignacion) throw new NotFoundError('Asignación no encontrada');
  return asignacion;
}

/** Entregar un equipo a una persona (POST /api/asignaciones). */
export async function asignarEquipo(data: CreateAssignmentInput, quien: string) {
  const [equipo, persona] = await Promise.all([
    prisma.asset.findUnique({ where: { id: data.assetId }, select: { sedeId: true } }),
    prisma.employee.findUnique({ where: { id: data.employeeId }, select: { sedeId: true } }),
  ]);
  if (!equipo) throw new NotFoundError('Activo no encontrado');
  if (!persona) throw new NotFoundError('Empleado no encontrado');
  return prisma.$transaction((tx) =>
    executeAssignment(tx, {
      sedeId: persona.sedeId,
      assetId: data.assetId,
      employeeId: data.employeeId,
      fechaEntrega: data.fechaEntrega,
      lugarEntrega: data.lugarEntrega,
      entregadoPor: data.entregadoPor,
      usuarioSistema: quien,
      tipoMovimiento: data.tipoMovimiento,
      motivo: data.motivo,
      nombreEquipo: data.nombreEquipo,
    })
  );
}

/** La asignacion, si existe y sigue activa; `yaDevuelta` es el mensaje si no lo esta. */
async function asignacionActiva(id: string, yaDevuelta: string) {
  const asignacion = await prisma.assignment.findUnique({ where: { id }, include: { asset: true, employee: true } });
  if (!asignacion) throw new NotFoundError('Asignación no encontrada');
  if (!asignacion.activo) throw new ValidationError(yaDevuelta);
  return asignacion;
}

/**
 * Registrar la devolucion (PUT /api/asignaciones/[id]). La fecha no puede ser
 * anterior a la entrega (salvo que la entrega no tenga fecha, de un import
 * historico).
 */
export async function registrarDevolucion(id: string, data: ReturnAssignmentInput, quien: string) {
  const asignacion = await asignacionActiva(id, 'Esta asignación ya fue devuelta');
  if (asignacion.fechaEntrega && data.fechaDevolucion < asignacion.fechaEntrega) {
    throw new ValidationError(
      `La fecha de devolución no puede ser anterior a la de entrega (${formatearFecha(asignacion.fechaEntrega)})`
    );
  }
  return prisma.$transaction((tx) =>
    executeReturn(tx, {
      assignmentId: id,
      fechaDevolucion: data.fechaDevolucion,
      recibidoPor: data.recibidoPor,
      usuarioSistema: quien,
      estadoDevolucion: data.estadoDevolucion,
      // Danado: se da de baja con su motivo (SPEC 2.135).
      ...(data.motivoBajaId && { motivoBaja: { id: data.motivoBajaId, detalle: data.motivoBajaDetalle || null } }),
      observacionesDevolucion: data.observacionesDevolucion,
    })
  );
}

/** Cancelar una asignacion que no se ha devuelto: se borra y el equipo vuelve a disponible. */
export async function cancelarAsignacion(id: string, quien: string) {
  const asignacion = await asignacionActiva(id, 'No se puede cancelar una asignación ya devuelta');
  await prisma.$transaction(async (tx) => {
    await tx.assignment.delete({ where: { id } });
    await cambiarEstado(tx, {
      activo: asignacion.asset,
      a: 'disponible',
      contexto: { motivo: 'Asignación cancelada' },
      datos: { empleadoActualId: null },
      historial: {
        tipoEvento: 'cambio_estado',
        descripcion: `Asignación cancelada. Equipo devuelto a disponible.`,
        datosAnteriores: { estado: asignacion.asset.estado, empleadoActualId: asignacion.employeeId },
        datosNuevos: { estado: 'disponible', empleadoActualId: null },
        usuarioSistema: quien,
      },
    });
  });
}
