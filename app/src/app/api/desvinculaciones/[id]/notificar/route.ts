import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { documentoArchivadoDe } from '@/lib/services/documentEmissionService';
import { contenidoCierreDesvinculacion } from '@/lib/documents/notificationContent';
import { enviarNotificacion, prepararNotificacion } from '@/lib/services/notificationService';
import { ConflictError, NotFoundError, handleApiError, requirePermission } from '@/lib/auth/guard';

/**
 * Envío o reintento explícito del aviso a RRHH de una desvinculación.
 *
 * El camino normal es la transición `consolidacion_cierre` de la solicitud,
 * que prepara el aviso junto con el acta. Esta ruta existe para las
 * desvinculaciones directas —las que no nacieron de una solicitud— y para
 * reintentar un aviso que Graph rechazó.
 *
 * No fabrica adjuntos: si el acta de devolución no está archivada, no hay nada
 * que enviar y lo dice (SPEC 2.1 septies).
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('desvinculaciones', 'write');
    const { id } = await params;

    const termination = await prisma.termination.findUnique({
      where: { id },
      include: { employee: true },
    });
    if (!termination) throw new NotFoundError('Desvinculación no encontrada');

    // Un aviso ya aceptado por Graph no se reenvía desde aquí: para mandar
    // otra copia hay que reemitir el documento y dejar constancia de por qué.
    const previa = await prisma.notificacionEnviada.findFirst({
      where: { terminationId: id, tipo: 'cierre_desvinculacion' },
      orderBy: { createdAt: 'desc' },
    });
    if (previa?.estado === 'enviada') {
      throw new ConflictError(
        `La notificación de esta desvinculación ya fue aceptada por Microsoft Graph${
          previa.aceptadaEn ? ` el ${previa.aceptadaEn.toISOString()}` : ''
        }`
      );
    }

    const acta = await documentoArchivadoDe({ terminationId: id, tipo: 'acta_devolucion' });
    if (!acta) {
      throw new ConflictError(
        'No hay un acta de devolución archivada para esta desvinculación. Cierre la devolución para emitirla, o reintente su archivo, antes de notificar a RRHH.'
      );
    }

    const enviadaPor = session.user?.name || session.user?.email || 'Sistema';

    // Reintentar reutiliza la fila: la evidencia de un aviso es una, con sus
    // intentos, no una fila nueva por cada clic.
    const notificacionId =
      previa?.id ??
      (
        await prisma.$transaction(async (tx) => {
          const { asunto, cuerpo } = contenidoCierreDesvinculacion({
            numeroSolicitud: null,
            empleado:
              `${termination.employee.nombres} ${termination.employee.apellidoPaterno}`.trim(),
            rut: termination.employee.rut,
            fechaDesvinculacion: termination.fechaDesvinculacion,
            documentos: [acta],
          });
          return prepararNotificacion(tx, {
            tipo: 'cierre_desvinculacion',
            asunto,
            cuerpo,
            documentoIds: [acta.id],
            enviadaPor,
            contexto: { terminationId: id },
          });
        })
      ).notificacionId;

    const envio = await enviarNotificacion(notificacionId);
    return NextResponse.json(envio);
  } catch (error) {
    return handleApiError(error, 'Error al notificar a RRHH');
  }
}
