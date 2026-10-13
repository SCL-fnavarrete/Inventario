import type { EstadoItemGuia, Prisma, WelcomeKitItem } from '@prisma/client';
import { auditLogService } from '@/shared/auditoria';
import { ConflictError } from '@/shared/errores';

type Tx = Prisma.TransactionClient;

/**
 * Kit/EPP: stock por sede (cada sede tiene su catalogo). Lo comparten las
 * compras (SPEC 2.111) y los despachos que llevan Kit/EPP (SPEC 2.111.4).
 */

/**
 * El mismo articulo (nombre y categoria) en el catalogo de otra sede, o uno
 * nuevo sin stock si esa sede no lo tiene. Es la forma de llevar Kit/EPP de
 * una sede a otra.
 */
export async function articuloKitEnSede(
  tx: Tx,
  item: Pick<WelcomeKitItem, 'nombre' | 'categoria' | 'stockMinimo'>,
  sedeId: string
) {
  const existente = await tx.welcomeKitItem.findFirst({
    where: { sedeId, categoria: item.categoria, nombre: { equals: item.nombre, mode: 'insensitive' } },
  });
  if (existente) return existente;
  return tx.welcomeKitItem.create({
    data: { nombre: item.nombre, categoria: item.categoria, stockMinimo: item.stockMinimo, cantidad: 0, sedeId },
  });
}

/** Suma stock a un articulo y lo deja en la auditoria del articulo. */
export async function sumarStockKit(
  tx: Tx,
  itemId: string,
  cantidad: number,
  descripcion: string,
  usuario: string
) {
  const item = await tx.welcomeKitItem.update({
    where: { id: itemId },
    data: { cantidad: { increment: cantidad } },
  });
  await auditLogService.registrarActualizacion(
    'kit_item',
    itemId,
    `${descripcion}: +${cantidad} ${item.nombre}`,
    { cantidad: item.cantidad - cantidad },
    { cantidad: item.cantidad },
    usuario,
    tx
  );
  return item;
}

/**
 * Resta stock de un articulo (sale en un despacho). Solo si alcanza: la resta
 * es atomica, asi dos despachos a la vez no dejan el stock en negativo.
 */
export async function restarStockKit(
  tx: Tx,
  itemId: string,
  cantidad: number,
  descripcion: string,
  usuario: string
) {
  const { count } = await tx.welcomeKitItem.updateMany({
    where: { id: itemId, cantidad: { gte: cantidad } },
    data: { cantidad: { decrement: cantidad } },
  });
  if (count !== 1) throw new ConflictError('El stock cambió y ya no alcanza. Vuelve a elegir las cantidades.');
  const item = await tx.welcomeKitItem.findUniqueOrThrow({ where: { id: itemId } });
  await auditLogService.registrarActualizacion(
    'kit_item',
    itemId,
    `${descripcion}: -${cantidad} ${item.nombre}`,
    { cantidad: item.cantidad + cantidad },
    { cantidad: item.cantidad },
    usuario,
    tx
  );
  return item;
}

/**
 * Estado de una linea de Kit/EPP de un despacho segun sus cantidades:
 * "en transito" mientras quede algo sin resolver; si no, "perdido" si se
 * perdio alguna unidad, o "recibido".
 */
export function estadoLineaKit(l: {
  cantidad: number;
  cantidadRecibida: number;
  cantidadPerdida: number;
}): EstadoItemGuia {
  if (l.cantidad - l.cantidadRecibida - l.cantidadPerdida > 0) return 'en_transito';
  return l.cantidadPerdida > 0 ? 'perdido' : 'recibido';
}
