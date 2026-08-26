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
      },
    });

    if (!workflowRequest) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    return NextResponse.json(workflowRequest);
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
        ...(data.prioridad !== undefined && { prioridad: data.prioridad }),
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
