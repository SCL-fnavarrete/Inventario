import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { transitionSchema } from '@/lib/validations/workflow';
import { canTransition, isFinalState } from '@/lib/services/workflowStateMachine';
import {
  executeAssignment,
  executeReturn,
  executeTerminationReturn,
} from '@/lib/services/workflowExecutionService';
import { SystemRole } from '@prisma/client';
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// POST /api/solicitudes/[id]/transicion - Advance workflow state
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {

  try {
    const session = await requirePermission('solicitudes', 'read');
    const { id } = await params;
    const body = await request.json();

    const validationResult = transitionSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const { nuevoEstado, comentario, datosAccion } = validationResult.data;

    // Find system user
    const systemUser = await prisma.systemUser.findUnique({
      where: { email: session.user?.email || '' },
    });
    if (!systemUser) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 });
    }

    // Find the request
    const workflowRequest = await prisma.workflowRequest.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!workflowRequest) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    // La entrega parcial de equipos en onboarding no es una transicion de estado
    // real: la solicitud se queda en gestion_ti hasta cubrir todas las categorias
    // requeridas, entregando de a poco lo que si hay stock. Por eso no pasa por
    // canTransition (no existe una regla gestion_ti -> gestion_ti) y en su lugar
    // solo se valida que el rol pueda gestionar TI.
    const esEntregaParcialOnboarding =
      workflowRequest.tipo === 'onboarding' &&
      workflowRequest.estado === 'gestion_ti' &&
      nuevoEstado === 'gestion_ti';

    if (esEntregaParcialOnboarding) {
      if (!['tecnico', 'admin'].includes(systemUser.rol)) {
        return NextResponse.json(
          { error: `No tiene permisos para gestionar equipos como ${systemUser.rol}` },
          { status: 403 }
        );
      }
    } else if (
      !canTransition(
        workflowRequest.tipo,
        workflowRequest.estado,
        nuevoEstado,
        systemUser.rol as SystemRole
      )
    ) {
      return NextResponse.json(
        {
          error: `Transición no permitida de ${workflowRequest.estado} a ${nuevoEstado} para rol ${systemUser.rol}`,
        },
        { status: 403 }
      );
    }

    const result = await prisma.$transaction(async (tx) => {
      const assignmentIds: string[] = [...workflowRequest.assignmentIds];

      // Execute side effects based on transition
      if (
        workflowRequest.tipo === 'onboarding' &&
        workflowRequest.estado === 'gestion_ti' &&
        (nuevoEstado === 'equipos_entregados' || nuevoEstado === 'gestion_ti')
      ) {
        // Create assignments for selected assets (entrega total o parcial)
        const assets = (datosAccion?.assetIds as string[]) || [];
        for (const assetId of assets) {
          const assignment = await executeAssignment(tx, {
            assetId,
            employeeId: workflowRequest.employeeId,
            fechaEntrega: new Date(),
            lugarEntrega: (datosAccion?.lugarEntrega as string) || null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'ingreso',
            motivo: `Onboarding - ${workflowRequest.numero}`,
          });
          assignmentIds.push(assignment.id);
        }
      }

      if (
        workflowRequest.tipo === 'cambio_equipo' &&
        workflowRequest.estado === 'incidencia_detectada' &&
        nuevoEstado === 'cambio_ejecutado'
      ) {
        // Return old asset and assign new one
        const oldAssignmentId = datosAccion?.oldAssignmentId as string | undefined;
        const newAssetId = datosAccion?.newAssetId as string | undefined;

        if (oldAssignmentId) {
          await executeReturn(tx, {
            assignmentId: oldAssignmentId,
            fechaDevolucion: new Date(),
            recibidoPor: systemUser.nombre,
            estadoDevolucion: (datosAccion?.estadoDevolucion as 'ok' | 'danado' | 'incompleto') || 'ok',
            observacionesDevolucion: `Cambio de equipo - ${workflowRequest.numero}`,
          });
        }

        if (newAssetId) {
          const assignment = await executeAssignment(tx, {
            assetId: newAssetId,
            employeeId: workflowRequest.employeeId,
            fechaEntrega: new Date(),
            lugarEntrega: (datosAccion?.lugarEntrega as string) || null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'cambio',
            motivo: workflowRequest.motivoCambio || `Cambio - ${workflowRequest.numero}`,
          });
          assignmentIds.push(assignment.id);
        }
      }

      if (
        workflowRequest.tipo === 'devolucion_termino' &&
        workflowRequest.estado === 'coordinacion_en_curso' &&
        nuevoEstado === 'equipo_recibido'
      ) {
        // Update devolucion details
        await tx.workflowRequest.update({
          where: { id },
          data: {
            medioDevolucion: (datosAccion?.medioDevolucion as string) || undefined,
            otChilexpress: (datosAccion?.otChilexpress as string) || undefined,
          },
        });
      }

      if (
        workflowRequest.tipo === 'devolucion_termino' &&
        workflowRequest.estado === 'equipo_recibido' &&
        nuevoEstado === 'consolidacion_cierre'
      ) {
        // Execute termination return if data provided
        const terminationData = datosAccion as Record<string, unknown> | undefined;
        if (terminationData?.terminationId) {
          const updatedTermination = await executeTerminationReturn(tx, {
            terminationId: terminationData.terminationId as string,
            fechaDevolucionEquipos: new Date(),
            estadoNotebook: (terminationData.estadoNotebook as 'ok' | 'danado' | 'no_aplica' | 'pendiente') || 'no_aplica',
            estadoCelular: (terminationData.estadoCelular as 'ok' | 'danado' | 'no_aplica' | 'pendiente') || 'no_aplica',
            estadoMonitor: (terminationData.estadoMonitor as 'ok' | 'danado' | 'no_aplica' | 'pendiente') || 'no_aplica',
            estadoKit: (terminationData.estadoKit as 'ok' | 'danado' | 'no_aplica' | 'pendiente') || 'no_aplica',
            recibidoPor: systemUser.nombre,
            lugarDevolucion: (terminationData.lugarDevolucion as string) || 'Oficina',
            observaciones: comentario || undefined,
          });
          await tx.workflowRequest.update({
            where: { id },
            data: { terminationId: updatedTermination.id },
          });
        }
      }

      // Update the request state
      const isFinal = isFinalState(workflowRequest.tipo, nuevoEstado);
      const updated = await tx.workflowRequest.update({
        where: { id },
        data: {
          estado: nuevoEstado,
          assignmentIds,
          ...(isFinal && { fechaCierre: new Date() }),
        },
        include: {
          employee: true,
          solicitante: { select: { id: true, nombre: true, rol: true } },
          responsableActual: { select: { id: true, nombre: true, rol: true } },
        },
      });

      // Log the transition
      await tx.workflowTransition.create({
        data: {
          requestId: id,
          estadoAnterior: workflowRequest.estado,
          estadoNuevo: nuevoEstado,
          ejecutadoPorId: systemUser.id,
          comentario: comentario || (esEntregaParcialOnboarding ? 'Entrega parcial de equipos' : undefined),
          datosAccion: datosAccion ? (datosAccion as Record<string, string | number | boolean | null>) : undefined,
        },
      });

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al avanzar solicitud');
  }
}
