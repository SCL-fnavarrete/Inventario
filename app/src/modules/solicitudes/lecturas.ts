import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { NotFoundError } from '@/shared/errores';
import { filtroSede } from '@/shared/sedes/filtro';
import { coincideBusqueda } from '@/shared/utilidades/text';
import { ordenarComo, paginarCoincidencias } from '@/shared/utilidades/busquedaEnMemoria';
import type { WorkflowFilters } from '@/modules/solicitudes/validaciones';
import {
  asignacionesDelTicket,
  desvinculacionesConActa,
  devueltaEnTicket,
  devueltasDespues,
  paresDeCambio,
} from '@/modules/solicitudes/consultasAsignaciones';

/**
 * Lecturas de Solicitudes contra la base (SPEC 3.2.2): la lista, las
 * estadisticas y el detalle. Quien las devuelve al navegador quita antes los
 * ids de usuario (sinIdsDeUsuario).
 */

/** Lista con filtros (GET /api/solicitudes). */
export async function listarSolicitudes(filters: WorkflowFilters, sedeId: string | null) {
  const skip = (filters.page - 1) * filters.limit;

  // Todas las sedes; la del navbar filtra (SPEC 2.117).
  const where: Prisma.WorkflowRequestWhereInput = filtroSede(sedeId);

  if (filters.tipo) where.tipo = filters.tipo;
  // 'abierto'/'cerrado' en vez del estado interno detallado: un ticket
  // esta cerrado cuando tiene fechaCierre (lo pone la transicion final).
  if (filters.estado === 'abierto') where.fechaCierre = null;
  if (filters.estado === 'cerrado') where.fechaCierre = { not: null };
  if (filters.responsableActualId) where.responsableActualId = filters.responsableActualId;

  if (filters.fechaDesde || filters.fechaHasta) {
    where.createdAt = {};
    if (filters.fechaDesde) where.createdAt.gte = new Date(filters.fechaDesde);
    if (filters.fechaHasta) where.createdAt.lte = new Date(filters.fechaHasta);
  }

  const includeSolicitud = {
    employee: {
      select: {
        id: true,
        rut: true,
        nombres: true,
        apellidoPaterno: true,
        apellidoMaterno: true,
        cargo: true,
        // El correo de empresa es el identificador visible del empleado;
        // el personal puede venir vacio
        correoEmpresa: true,
        correoPersonal: true,
      },
    },
    solicitante: { select: { nombre: true, rol: true } },
    responsableActual: { select: { nombre: true, rol: true } },
    _count: { select: { comments: true, pendientes: true } },
  } as const;

  // El termino de busqueda se filtra en memoria en vez de mandarlo a
  // Prisma como `contains`: `employee.rut` se guarda formateado
  // ("12.345.678-9") y el usuario casi siempre lo escribe sin puntos. El
  // criterio (RUT, o palabra por palabra sin acentos) es el comun de
  // `coincideBusqueda`: "juan perez" encuentra a Juan Pérez.
  const terminoBusqueda = filters.search?.trim() ?? "";

  let data;
  let total;

  if (terminoBusqueda) {
    // Solo las columnas de busqueda; el detalle, solo de la pagina.
    const candidatas = await prisma.workflowRequest.findMany({
      where,
      orderBy: { [filters.sortBy]: filters.sortOrder },
      select: {
        id: true,
        numero: true,
        observaciones: true,
        employee: { select: { rut: true, nombres: true, apellidoPaterno: true, apellidoMaterno: true } },
      },
    });
    const pagina = paginarCoincidencias(
      candidatas,
      (s) =>
        coincideBusqueda(terminoBusqueda, {
          rut: s.employee.rut,
          campos: [s.numero, s.observaciones, s.employee.nombres, s.employee.apellidoPaterno, s.employee.apellidoMaterno],
        }),
      skip,
      filters.limit
    );

    total = pagina.total;
    data = ordenarComo(
      pagina.ids,
      await prisma.workflowRequest.findMany({ where: { id: { in: pagina.ids } }, include: includeSolicitud })
    );
  } else {
    [data, total] = await Promise.all([
      prisma.workflowRequest.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: includeSolicitud,
      }),
      prisma.workflowRequest.count({ where }),
    ]);
  }

  // Que desvinculaciones tienen Acta de Devolucion, para no ofrecer una
  // descarga vacia en la lista (SPEC 2.87).
  const conActa = await desvinculacionesConActa(data);

  return {
    data: data.map((s) => ({ ...s, tieneActa: conActa.has(s.id) })),
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages: Math.ceil(total / filters.limit),
    },
  };
}

/** Estadisticas de Solicitudes (GET /api/solicitudes/stats): toda la empresa (SPEC 2.117). */
export async function resumenSolicitudes() {
  const [porTipo, porEstado, total, abiertas] = await Promise.all([
    prisma.workflowRequest.groupBy({ by: ['tipo'], _count: { id: true } }),
    prisma.workflowRequest.groupBy({ by: ['estado'], _count: { id: true } }),
    prisma.workflowRequest.count(),
    prisma.workflowRequest.count({ where: { fechaCierre: null } }),
  ]);
  return {
    total,
    abiertas,
    cerradas: total - abiertas,
    porTipo: porTipo.map((t) => ({ tipo: t.tipo, count: t._count.id })),
    porEstado: porEstado.map((s) => ({ estado: s.estado, count: s._count.id })),
  };
}

/**
 * Detalle de una solicitud (GET /api/solicitudes/[id]), con los equipos de
 * ESTE ticket (assignmentIds), no los que la persona tiene hoy: lo entregado
 * en un onboarding, lo devuelto en una desvinculacion y los pares de un
 * cambio (SPEC 2.84).
 */
export async function detalleSolicitud(id: string) {
  const solicitud = await prisma.workflowRequest.findUnique({
    where: { id },
    include: {
      employee: {
        include: {
          assignments: { where: { activo: true }, include: { asset: { include: { categoria: true } } } },
          // EPP entregado y aun no devuelto: para calificarlo desde el ticket
          // de offboarding, igual que los equipos.
          kitAssignments: { where: { estado: 'entregado', item: { categoria: 'epp' } }, include: { item: true } },
        },
      },
      solicitante: { select: { nombre: true, rol: true, email: true } },
      responsableActual: { select: { nombre: true, rol: true, email: true } },
      comments: { include: { autor: { select: { nombre: true, rol: true } } }, orderBy: { createdAt: 'desc' } },
      transitions: { include: { ejecutadoPor: { select: { nombre: true, rol: true } } }, orderBy: { createdAt: 'desc' } },
      pendientes: { orderBy: { createdAt: 'asc' } },
      kitAssignments: { include: { item: true }, orderBy: { createdAt: 'desc' } },
      // Lo requerido de Kit/EPP articulo por articulo, para resolver cada uno.
      kitRequeridos: { include: { item: true }, orderBy: { createdAt: 'asc' } },
    },
  });
  if (!solicitud) throw new NotFoundError('Solicitud no encontrada');

  // recuperadoEn: el equipo no se devolvio en este ticket sino en uno
  // posterior (SPEC 2.87); la asignacion solo guarda su ultimo estado.
  const [asignaciones, recuperadas] = await Promise.all([
    asignacionesDelTicket(solicitud.assignmentIds),
    devueltasDespues(solicitud),
  ]);
  const asignacionesTicket = asignaciones.map((a) => ({ ...a, recuperadoEn: recuperadas.get(a.id) ?? null }));
  // Acta de Devolucion solo si en este ticket se devolvio algo (SPEC 2.87);
  // un ticket antiguo sin assignmentIds conserva su criterio anterior.
  const tieneActa =
    solicitud.tipo === 'offboarding' &&
    (solicitud.assignmentIds.length === 0 || asignaciones.some((a) => devueltaEnTicket(a, recuperadas)));
  // Mismo criterio para el EPP devuelto en este ticket (kitReturnIds).
  const eppDevueltos =
    solicitud.tipo === 'offboarding' && solicitud.kitReturnIds.length > 0
      ? await prisma.kitAssignment.findMany({
          where: { id: { in: solicitud.kitReturnIds } },
          include: { item: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

  return {
    ...solicitud,
    equiposEntregados: solicitud.tipo === 'onboarding' ? asignacionesTicket : [],
    equiposDevueltos: solicitud.tipo === 'offboarding' ? asignacionesTicket : [],
    eppDevueltos,
    paresCambio: solicitud.tipo === 'cambio_equipo' ? paresDeCambio(solicitud.assignmentIds, asignacionesTicket) : [],
    tieneActa,
  };
}
