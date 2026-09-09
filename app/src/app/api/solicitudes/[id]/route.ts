import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateWorkflowRequestSchema } from '@/lib/validations/workflow';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// GET /api/solicitudes/[id] - Get full detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    await requirePermission('solicitudes', 'read');
    const { id } = await params;

    const workflowRequest = await prisma.workflowRequest.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            assignments: {
              where: { activo: true },
              include: { asset: { include: { categoria: true } } },
            },
            // EPP entregado y aun no devuelto: se necesita para poder
            // calificarlo/devolverlo desde el ticket de offboarding, igual
            // que con los equipos.
            kitAssignments: {
              where: { estado: 'entregado', item: { categoria: 'epp' } },
              include: { item: true },
            },
          },
        },
        solicitante: { select: { id: true, nombre: true, rol: true, email: true } },
        responsableActual: { select: { id: true, nombre: true, rol: true, email: true } },
        comments: {
          include: {
            autor: { select: { id: true, nombre: true, rol: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        transitions: {
          include: {
            ejecutadoPor: { select: { id: true, nombre: true, rol: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        pendientes: {
          orderBy: { createdAt: 'asc' },
        },
        kitAssignments: {
          include: { item: true },
          orderBy: { createdAt: 'desc' },
        },
        // Detalle articulo-por-articulo de lo requerido en el onboarding
        // (Kit de Bienvenida / EPP), para poder mostrar y resolver
        // (entregado / no aplica) cada uno individualmente.
        kitRequeridos: {
          include: { item: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!workflowRequest) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    // Equipos devueltos en este ticket de offboarding: assignmentIds guarda
    // las asignaciones que se fueron devolviendo (calificadas ok/danado),
    // pero como ya quedaron con activo:false, "employee.assignments" (que
    // solo trae las activas) no las incluye -- hay que buscarlas aparte.
    const equiposDevueltos =
      workflowRequest.tipo === 'offboarding' && workflowRequest.assignmentIds.length > 0
        ? await prisma.assignment.findMany({
            where: { id: { in: workflowRequest.assignmentIds } },
            include: { asset: { include: { categoria: true } } },
            orderBy: { fechaDevolucion: 'desc' },
          })
        : [];

    // Mismo criterio para el EPP devuelto en este ticket (kitReturnIds).
    const eppDevueltos =
      workflowRequest.tipo === 'offboarding' && workflowRequest.kitReturnIds.length > 0
        ? await prisma.kitAssignment.findMany({
            where: { id: { in: workflowRequest.kitReturnIds } },
            include: { item: true },
            orderBy: { createdAt: 'desc' },
          })
        : [];

    // Cambio de equipo: assignmentIds mezcla la asignacion vieja (devuelta,
    // con estadoDevolucion) y la nueva (entregada, sin estadoDevolucion) --
    // se separan aca para poder mostrar "equipo anterior" y "equipo nuevo"
    // por separado en el detalle del ticket.
    const equiposCambio =
      workflowRequest.tipo === 'cambio_equipo' && workflowRequest.assignmentIds.length > 0
        ? await prisma.assignment.findMany({
            where: { id: { in: workflowRequest.assignmentIds } },
            include: { asset: { include: { categoria: true } } },
            orderBy: { createdAt: 'asc' },
          })
        : [];
    const equipoCambioAnterior = equiposCambio.find((a) => a.estadoDevolucion !== null) || null;
    const equipoCambioNuevo = equiposCambio.find((a) => a.estadoDevolucion === null) || null;

    return NextResponse.json({
      ...workflowRequest,
      equiposDevueltos,
      eppDevueltos,
      equipoCambioAnterior,
      equipoCambioNuevo,
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener solicitud');
  }
}

// PATCH /api/solicitudes/[id] - Update metadata
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateWorkflowRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const existing = await prisma.workflowRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    const data = validationResult.data;
    const updated = await prisma.workflowRequest.update({
      where: { id },
      data: {
        ...(data.responsableActualId !== undefined && {
          responsableActualId: data.responsableActualId,
        }),
        ...(data.observaciones !== undefined && { observaciones: data.observaciones }),
      },
      include: {
        employee: true,
        solicitante: { select: { id: true, nombre: true, rol: true } },
        responsableActual: { select: { id: true, nombre: true, rol: true } },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar solicitud');
  }
}
