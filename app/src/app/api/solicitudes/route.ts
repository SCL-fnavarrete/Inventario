import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/shared/prisma';
import { createWorkflowRequestSchema, workflowFiltersSchema } from '@/modules/solicitudes';
import { crearSolicitud, desvinculacionesConActa } from '@/modules/solicitudes/servidor';
import { Prisma } from '@prisma/client';
import { requirePermission, handleApiError, respuestaDatosInvalidos, usuarioDeSesion } from '@/shared/auth/guard';
import { filtroSede } from '@/shared/sedes/filtro';
import { coincideBusqueda } from '@/shared/utilidades/text';
import { ordenarComo, paginarCoincidencias } from "@/shared/utilidades/busquedaEnMemoria";
import { sinIdsDeUsuario } from '@/shared/utilidades/privacidad';

// GET /api/solicitudes - List with filters
export async function GET(request: NextRequest) {

  try {
    await requirePermission('solicitudes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const filtersResult = workflowFiltersSchema.safeParse({
      search: searchParams.get('search') || undefined,
      tipo: searchParams.get('tipo') || undefined,
      estado: searchParams.get('estado') || undefined,
      responsableActualId: searchParams.get('responsableActualId') || undefined,
      fechaDesde: searchParams.get('fechaDesde') || undefined,
      fechaHasta: searchParams.get('fechaHasta') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 10,
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Todas las sedes; la del navbar filtra (SPEC 2.117).
    const where: Prisma.WorkflowRequestWhereInput = filtroSede(searchParams.get("sedeId"));

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

    return NextResponse.json(sinIdsDeUsuario({
      data: data.map((s) => ({ ...s, tieneActa: conActa.has(s.id) })),
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    }));
  } catch (error) {
    return handleApiError(error, 'Error al obtener solicitudes');
  }
}

// POST /api/solicitudes - Crear una solicitud (se crea y se cierra en el
// mismo formulario, SPEC 2.82).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('solicitudes', 'write');
    const body = await request.json();
    const parsed = createWorkflowRequestSchema.safeParse(body);
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const result = await crearSolicitud(
      parsed.data,
      (body as { sedeId?: string }).sedeId,
      usuarioDeSesion(session)
    );
    return NextResponse.json(sinIdsDeUsuario(result), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear solicitud');
  }
}
