import { Prisma } from '@prisma/client';
import { entregarKit, type ExecuteKitDeliveryParams } from '@/modules/kit-epp/servidor';

type PrismaTx = Prisma.TransactionClient;

/**
 * Entrega Kit de Bienvenida / EPP de una solicitud: Kit/EPP descuenta el
 * stock y registra la entrega; si el articulo estaba en la lista de
 * requeridos de la solicitud (RequestKitItem), la entrega lo resuelve, asi el
 * tecnico no tiene que marcarlo aparte para poder cerrar el ticket.
 */
export async function executeKitDelivery(tx: PrismaTx, params: ExecuteKitDeliveryParams) {
  const entrega = await entregarKit(tx, params);
  if (params.requestId) {
    await tx.requestKitItem.updateMany({
      where: { requestId: params.requestId, itemId: params.itemId, estado: 'pendiente' },
      data: { estado: 'entregado', resueltoPor: params.entregadoPor || null, resueltoEn: new Date() },
    });
  }
  return entrega;
}
