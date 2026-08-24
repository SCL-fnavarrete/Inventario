import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { enviarNotificacion } from '@/lib/services/notificationService';
import { ConflictError, NotFoundError, handleApiError, requirePermission } from '@/lib/auth/guard';

/**
 * Reintento del aviso de cierre de una solicitud.
 *
 * Solo reintenta: no prepara nada. El aviso lo crea la transición que cierra la
 * solicitud, dentro de su transacción, con los documentos que correspondan
 * (SPEC 2.1 septies). Preparar uno aquí sería fabricar la evidencia de un cierre
 * que ya ocurrió.
 *
 * Existe porque no había ninguna forma de reintentar un aviso de
 * `cierre_onboarding`: `/api/desvinculaciones/[id]/notificar` filtra por
 * `terminationId` y por `cierre_desvinculacion`, y repetir la transición es
 * imposible —el CAS y la máquina de estados la rechazan—. Un aviso que Graph
 * rechazaba quedaba `fallida` para siempre.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('solicitudes', 'write');
    const { id } = await params;

    const solicitud = await prisma.workflowRequest.findUnique({
      where: { id },
      select: { id: true, numero: true },
    });
    if (!solicitud) throw new NotFoundError('Solicitud no encontrada');

    const previa = await prisma.notificacionEnviada.findFirst({
      where: { requestId: id },
      orderBy: { createdAt: 'desc' },
    });
    if (!previa) {
      throw new ConflictError(
        `La solicitud ${solicitud.numero} no tiene ningún aviso preparado. El aviso a RRHH se prepara al cerrarla; no se puede crear después.`
      );
    }
    if (previa.estado === 'enviada') {
      throw new ConflictError(
        `El aviso de esta solicitud ya fue aceptado por Microsoft Graph${
          previa.aceptadaEn ? ` el ${previa.aceptadaEn.toISOString()}` : ''
        }`
      );
    }
    // Un aviso sin confirmar no se reintenta a ciegas: `sendMail` no ofrece
    // clave de idempotencia, así que el correo pudo haber salido.
    if (previa.estado === 'enviando') {
      throw new ConflictError(
        'Hay un envío de este aviso en curso o sin confirmar. Revise el buzón de destino antes de reintentar: un reintento puede enviar una segunda copia.'
      );
    }

    const envio = await enviarNotificacion(previa.id);
    return NextResponse.json(envio);
  } catch (error) {
    return handleApiError(error, 'Error al reintentar el aviso de la solicitud');
  }
}
