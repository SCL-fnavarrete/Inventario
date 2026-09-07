import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createWorkflowRequestSchema, workflowFiltersSchema } from '@/lib/validations/workflow';
import { getInitialState } from '@/lib/services/workflowStateMachine';
import { Prisma } from '@prisma/client';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

async function generateNumero(): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.workflowRequest.count({
    where: {
      numero: { startsWith: `WF-${year}-` },
    },
  });
  return `WF-${year}-${String(count + 1).padStart(4, '0')}`;
}

// GET /api/solicitudes - List with filters
export async function GET(request: NextRequest) {

  try {
    await requirePermission('solicitudes', 'read');
    const searchParams = request.nextUrl.searchParams;
    const filtersResult = workflowFiltersSchema.safeParse({
      search: searchParams.get('search') || undefined,
      tipo: searchParams.get('tipo') || undefined,
      estado: searchParams.get('estado') || undefined,
      prioridad: searchParams.get('prioridad') || undefined,
      responsableActualId: searchParams.get('responsableActualId') || undefined,
      fechaDesde: searchParams.get('fechaDesde') || undefined,
      fechaHasta: searchParams.get('fechaHasta') || undefined,
      page: searchParams.get('page') || 1,
      limit: searchParams.get('limit') || 10,
      sortBy: searchParams.get('sortBy') || 'createdAt',
      sortOrder: searchParams.get('sortOrder') || 'desc',
    });

    if (!filtersResult.success) {
      return NextResponse.json(
        { error: 'Parámetros inválidos', details: filtersResult.error.issues },
        { status: 400 }
      );
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    const where: Prisma.WorkflowRequestWhereInput = {};

    if (filters.tipo) where.tipo = filters.tipo;
    if (filters.estado) where.estado = filters.estado;
    if (filters.prioridad) where.prioridad = filters.prioridad;
    if (filters.responsableActualId) where.responsableActualId = filters.responsableActualId;

    if (filters.fechaDesde || filters.fechaHasta) {
      where.createdAt = {};
      if (filters.fechaDesde) where.createdAt.gte = new Date(filters.fechaDesde);
      if (filters.fechaHasta) where.createdAt.lte = new Date(filters.fechaHasta);
    }

    if (filters.search) {
      where.OR = [
        { numero: { contains: filters.search, mode: 'insensitive' } },
        { employee: { nombres: { contains: filters.search, mode: 'insensitive' } } },
        { employee: { apellidoPaterno: { contains: filters.search, mode: 'insensitive' } } },
        { employee: { rut: { contains: filters.search, mode: 'insensitive' } } },
        { observaciones: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.workflowRequest.findMany({
        where,
        skip,
        take: filters.limit,
        orderBy: { [filters.sortBy]: filters.sortOrder },
        include: {
          employee: {
            select: {
              id: true,
              rut: true,
              nombres: true,
              apellidoPaterno: true,
              apellidoMaterno: true,
              cargo: true,
              correo: true,
            },
          },
          solicitante: { select: { id: true, nombre: true, rol: true } },
          responsableActual: { select: { id: true, nombre: true, rol: true } },
          _count: { select: { comments: true, pendientes: true } },
        },
      }),
      prisma.workflowRequest.count({ where }),
    ]);

    return NextResponse.json({
      data,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener solicitudes');
  }
}

// POST /api/solicitudes - Create new request
export async function POST(request: NextRequest) {

  try {
    const session = await requirePermission('solicitudes', 'write');
    const body = await request.json();
    const validationResult = createWorkflowRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Find the system user by session email
    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Verify employee exists
    const employee = await prisma.employee.findUnique({
      where: { id: data.employeeId },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Empleado no encontrado' }, { status: 404 });
    }

    const numero = await generateNumero();
    const estadoInicial = getInitialState(data.tipo);

    const createData: Prisma.WorkflowRequestCreateInput = {
      numero,
      tipo: data.tipo,
      estado: estadoInicial,
      prioridad: data.prioridad || 'media',
      employee: { connect: { id: data.employeeId } },
      solicitante: { connect: { id: systemUser.id } },
      responsableActual: data.responsableActualId
        ? { connect: { id: data.responsableActualId } }
        : undefined,
      observaciones: data.observaciones,
    };

    // Type-specific fields
    if (data.tipo === 'onboarding') {
      createData.fechaIngreso = data.fechaIngreso;
      createData.cargoSolicitado = data.cargoSolicitado;
      createData.ubicacionDestino = data.ubicacionDestino;
      createData.categoriasRequeridas = data.categoriasRequeridas;
    } else if (data.tipo === 'cambio_equipo') {
      createData.ticketFreshdesk = data.ticketFreshdesk;
      createData.motivoCambio = data.motivoCambio;
    } else if (data.tipo === 'devolucion_termino') {
      createData.fechaDesvinculacion = data.fechaDesvinculacion;
      createData.medioDevolucion = data.medioDevolucion;
      createData.otChilexpress = data.otChilexpress;
      createData.ciudadDevolucion = data.ciudadDevolucion;
    }

    const result = await prisma.$transaction(async (tx) => {
      const workflowRequest = await tx.workflowRequest.create({
        data: createData,
        include: {
          employee: true,
          solicitante: { select: { id: true, nombre: true, rol: true } },
          responsableActual: { select: { id: true, nombre: true, rol: true } },
        },
      });

      // Create initial transition log
      await tx.workflowTransition.create({
        data: {
          requestId: workflowRequest.id,
          estadoAnterior: estadoInicial,
          estadoNuevo: estadoInicial,
          ejecutadoPorId: systemUser.id,
          comentario: 'Solicitud creada',
        },
      });

      // Create pendientes if provided
      if (data.pendientes && data.pendientes.length > 0) {
        await tx.workflowPendiente.createMany({
          data: data.pendientes.map((p) => ({
            requestId: workflowRequest.id,
            tipo: p.tipo,
            descripcion: p.descripcion || null,
          })),
        });
      }

      return workflowRequest;
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear solicitud');
  }
}
