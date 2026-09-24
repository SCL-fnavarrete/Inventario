import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateWorkflowRequestSchema } from '@/lib/validations/workflow';
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import {
  asignacionesDelTicket,
  devueltasDespues,
  paresDeCambio,
} from '@/lib/queries/asignacionesTicket';

// GET /api/solicitudes/[id] - Get full detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const session = await requirePermission('solicitudes', 'read');
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

    assertSedeAccess(session, workflowRequest.sedeId, 'Solicitud no encontrada');

    // Equipos de ESTE ticket (assignmentIds), no los que el empleado tiene
    // hoy: lo entregado en un onboarding, lo devuelto en una desvinculacion
    // y los pares de un cambio (SPEC 2.84).
    // recuperadoEn: el equipo no se devolvio en este ticket, sino en uno
    // posterior (SPEC 2.87); la asignacion solo guarda su ultimo estado.
    const [asignaciones, recuperadas] = await Promise.all([
      asignacionesDelTicket(workflowRequest.assignmentIds),
      devueltasDespues(workflowRequest),
    ]);
    const asignacionesTicket = asignaciones.map((a) => ({
      ...a,
      recuperadoEn: recuperadas.get(a.id) ?? null,
    }));
    const equiposEntregados = workflowRequest.tipo === 'onboarding' ? asignacionesTicket : [];
    const equiposDevueltos = workflowRequest.tipo === 'offboarding' ? asignacionesTicket : [];
    const paresCambio =
      workflowRequest.tipo === 'cambio_equipo'
        ? paresDeCambio(workflowRequest.assignmentIds, asignacionesTicket)
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

    return NextResponse.json({
      ...workflowRequest,
      equiposEntregados,
      equiposDevueltos,
      eppDevueltos,
      paresCambio,
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
    const session = await requirePermission('solicitudes', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateWorkflowRequestSchema.safeParse(body);
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const existing = await prisma.workflowRequest.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    assertSedeAccess(session, existing.sedeId, 'Solicitud no encontrada');

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
