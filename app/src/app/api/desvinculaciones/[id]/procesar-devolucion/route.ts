import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { registerReturnSchema } from '@/lib/validations/termination';
import { executeTerminationReturn } from '@/lib/services/workflowExecutionService';
import { datosDeDevolucion, firmaDeEvidencias } from '@/lib/documents/snapshotBuilder';
import { archivarDocumento, prepararEmision } from '@/lib/services/documentEmissionService';
import { enviarNotificacion, prepararNotificacion } from '@/lib/services/notificationService';
import { contenidoCierreDesvinculacion } from '@/lib/documents/notificationContent';
import { requirePermission, handleApiError, NotFoundError } from '@/lib/auth/guard';

/**
 * Cierre de una desvinculación **directa**: la que no nació de una solicitud.
 *
 * Emite el acta y avisa a RRHH con las mismas reglas que la transición
 * `consolidacion_cierre` de una solicitud (SPEC 2.1 sexies y 2.1 septies). Antes
 * solo cerraba la devolución, y eso dejaba un callejón sin salida: el operador
 * procesaba la devolución, intentaba notificar, y `/notificar` respondía 409
 * pidiendo que cerrara la devolución para emitir el acta —sobre una devolución
 * ya cerrada—. Reemitirla después tampoco era una salida: crear hoy la evidencia
 * de un acto de hace meses sería fabricarla.
 *
 * La emisión y la preparación del aviso van **dentro** de la transacción; el
 * archivo en SharePoint y el envío por Graph, **después del commit**, porque un
 * tenant caído no puede deshacer una devolución que ya ocurrió físicamente.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('desvinculaciones', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = registerReturnSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;
    const registradoPor = session.user?.name || session.user?.email || 'Sistema';

    const { resultado, emision, notificacionId } = await prisma.$transaction(
      async (tx) => {
        const eventTimestamp = new Date();
        const termination = await tx.termination.findUnique({
          where: { id },
          include: { employee: true },
        });
        if (!termination) throw new NotFoundError('Desvinculación no encontrada');

        const devuelto = await executeTerminationReturn(
          tx,
          {
            terminationId: id,
            fechaDevolucionEquipos: data.fechaDevolucionEquipos,
            estadoNotebook: data.estadoNotebook,
            estadoCelular: data.estadoCelular,
            estadoMonitor: data.estadoMonitor,
            estadoOtros: data.estadoOtros,
            estadoKit: data.estadoKit,
            recibidoPor: data.recibidoPor,
            lugarDevolucion: data.lugarDevolucion,
            requiereDescuento: data.requiereDescuento,
            montoDescuento: data.montoDescuento,
            motivoDescuento: data.motivoDescuento,
            observaciones: data.observaciones,
            firmaEmpleadoDevolucion: data.firmaEmpleadoDevolucion,
            aceptaPoliticaUso: data.aceptaPoliticaUso,
          },
          { eventTimestamp }
        );

        const emitida = await prepararEmision(tx, {
          contexto: { employeeId: termination.employeeId, terminationId: id },
          emitidoPor: registradoPor,
          emitidoEn: eventTimestamp,
          datos: await datosDeDevolucion(tx, {
            employeeId: termination.employeeId,
            // Una desvinculación directa no tiene solicitud que la origine.
            solicitud: null,
            recibidoPor: data.recibidoPor,
            fechaDevolucion: data.fechaDevolucionEquipos,
            fechaTermino: termination.fechaDesvinculacion ?? null,
            lugarDevolucion: data.lugarDevolucion,
            observaciones: data.observaciones ?? null,
            // Las asignaciones exactas que este cierre devolvió, no las que el
            // empleado tenga después.
            assignmentIds: devuelto.evidenciasParaDocumento.map((e) => e.assignmentId),
            firma: firmaDeEvidencias(devuelto.evidenciasParaDocumento),
          }),
        });

        const { asunto, cuerpo } = contenidoCierreDesvinculacion({
          numeroSolicitud: null,
          empleado:
            `${termination.employee.nombres} ${termination.employee.apellidoPaterno}`.trim(),
          rut: termination.employee.rut,
          fechaDesvinculacion: termination.fechaDesvinculacion,
          documentos: [{ numero: emitida.numero, version: emitida.version }],
        });
        const aviso = await prepararNotificacion(tx, {
          tipo: 'cierre_desvinculacion',
          asunto,
          cuerpo,
          documentoIds: [emitida.documentoId],
          enviadaPor: registradoPor,
          contexto: { terminationId: id },
        });

        return { resultado: devuelto, emision: emitida, notificacionId: aviso.notificacionId };
      },
      { timeout: 25_000 }
    );

    // Después del commit. Un fallo aquí deja evidencia `fallido`/`fallida`
    // reintentable, pero no revierte la devolución.
    const archivo = await archivarDocumento(emision.documentoId);
    const envio = await enviarNotificacion(notificacionId);

    return NextResponse.json({
      ...resultado,
      documentos: [
        {
          documentoId: emision.documentoId,
          numero: emision.numero,
          version: emision.version,
          tipo: emision.tipo,
          archivoEstado: archivo.archivoEstado,
          sharepointUrl: archivo.sharepointUrl,
          error: archivo.error,
        },
      ],
      notificaciones: [envio],
    });
  } catch (error) {
    return handleApiError(error, 'Error al procesar devolución');
  }
}
