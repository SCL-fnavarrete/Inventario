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

    const { nuevoEstado, comentario } = validationResult.data;
    const datosAccion =
      'datosAccion' in validationResult.data ? validationResult.data.datosAccion : undefined;
    const datosAccionRecord = datosAccion as Record<string, unknown> | undefined;

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

    // Validate transition
    if (
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
        nuevoEstado === 'equipos_entregados'
      ) {
        // Create assignments for selected assets
        const assets = (datosAccionRecord?.assetIds as string[]) || [];
        for (const assetId of assets) {
          const assignment = await executeAssignment(tx, {
            assetId,
            employeeId: workflowRequest.employeeId,
            fechaEntrega: new Date(),
            lugarEntrega: (datosAccionRecord?.lugarEntrega as string) || null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'ingreso',
            motivo: `Onboarding - ${workflowRequest.numero}`,
            firmaEmpleadoEntrega: datosAccionRecord?.firmaEmpleadoEntrega as string,
            aceptaPoliticaUso: datosAccionRecord?.aceptaPoliticaUso as true,
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
        const oldAssignmentId = datosAccionRecord?.oldAssignmentId as string | undefined;
        const newAssetId = datosAccionRecord?.newAssetId as string | undefined;

        if (oldAssignmentId) {
          await executeReturn(tx, {
            assignmentId: oldAssignmentId,
            fechaDevolucion: new Date(),
            recibidoPor: systemUser.nombre,
            estadoDevolucion: (datosAccionRecord?.estadoDevolucion as 'ok' | 'danado' | 'incompleto') || 'ok',
            observacionesDevolucion: `Cambio de equipo - ${workflowRequest.numero}`,
            firmaEmpleadoDevolucion: datosAccionRecord?.firmaEmpleadoDevolucion as string,
            aceptaPoliticaUso: datosAccionRecord?.aceptaPoliticaUso as true,
          });
        }

        if (newAssetId) {
          const assignment = await executeAssignment(tx, {
            assetId: newAssetId,
            employeeId: workflowRequest.employeeId,
            fechaEntrega: new Date(),
            lugarEntrega: (datosAccionRecord?.lugarEntrega as string) || null,
            entregadoPor: systemUser.nombre,
            tipoMovimiento: 'cambio',
            motivo: workflowRequest.motivoCambio || `Cambio - ${workflowRequest.numero}`,
            firmaEmpleadoEntrega: datosAccionRecord?.firmaEmpleadoEntrega as string,
            aceptaPoliticaUso: datosAccionRecord?.aceptaPoliticaUso as true,
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
            medioDevolucion: (datosAccionRecord?.medioDevolucion as string) || undefined,
            otChilexpress: (datosAccionRecord?.otChilexpress as string) || undefined,
          },
        });
      }

      if (
        workflowRequest.tipo === 'devolucion_termino' &&
        workflowRequest.estado === 'equipo_recibido' &&
        nuevoEstado === 'consolidacion_cierre'
      ) {
        // Execute termination return if data provided
        const terminationData = datosAccionRecord;
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
            firmaEmpleadoDevolucion: terminationData.firmaEmpleadoDevolucion as string,
            aceptaPoliticaUso: terminationData.aceptaPoliticaUso as true,
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
          comentario,
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
