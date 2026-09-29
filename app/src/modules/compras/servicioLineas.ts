import { prisma } from '@/shared/prisma';
import { ConflictError, NotFoundError } from '@/shared/errores';
import type { AgregarEquiposCompraInput, LinkKitItemsToPurchaseInput } from '@/modules/compras/validaciones';
import { buscarCompra, equiposDeCompra, lineasKitDeCompra } from '@/modules/compras/lecturas';
import {
  agregarEquiposNuevos,
  agregarLineasKit,
  quitarEquipo,
  vincularEquiposExistentes,
} from '@/modules/compras/servicio';

/**
 * Lo que se agrega o se quita de una compra ya registrada (solo admin):
 * equipos y lineas de Kit/EPP (SPEC 2.111).
 */

/**
 * Agregar equipos: comprados (nacen "Por repartir" en la sede de llegada) y/o
 * que ya existian (solo se vinculan a la factura).
 */
export async function agregarEquiposACompra(id: string, data: AgregarEquiposCompraInput, usuario: string) {
  const compra = await buscarCompra(id);
  return prisma.$transaction(async (tx) => {
    await agregarEquiposNuevos(tx, compra, data.equiposNuevos, usuario);
    if (data.assetIds.length > 0) await vincularEquiposExistentes(tx, compra, data.assetIds, usuario);
    return equiposDeCompra(id, tx);
  });
}

/**
 * Quitar equipos: uno comprado que sigue "Por repartir" se descarta; uno ya
 * repartido no se quita; uno solo vinculado se desvincula.
 */
export async function quitarEquiposDeCompra(id: string, assetIds: string[], usuario: string) {
  const compra = await buscarCompra(id);
  const vinculos = await prisma.purchaseAsset.findMany({
    where: { purchaseId: id, assetId: { in: assetIds }, asset: { deletedAt: null } },
    include: { asset: { select: { estado: true } } },
  });
  if (vinculos.length === 0) throw new NotFoundError('Esos equipos no son de esta compra');
  await prisma.$transaction(async (tx) => {
    for (const vinculo of vinculos) await quitarEquipo(tx, compra, vinculo, usuario);
  });
  return vinculos.length;
}

/** Agregar lineas de Kit/EPP: quedan "por repartir"; el stock sube recien al repartirlas. */
export async function agregarKitACompra(id: string, data: LinkKitItemsToPurchaseInput) {
  const compra = await buscarCompra(id);
  return prisma.$transaction(async (tx) => {
    await agregarLineasKit(tx, compra, data.items);
    return lineasKitDeCompra(id, tx);
  });
}

/** Quitar lineas de Kit/EPP que no se han repartido (no sumaron stock: nada que revertir). */
export async function quitarKitDeCompra(id: string, lineIds: string[]) {
  await buscarCompra(id);
  const lineas = await prisma.purchaseKitItem.findMany({
    where: { purchaseId: id, id: { in: lineIds } },
    include: { item: { select: { nombre: true } } },
  });
  if (lineas.length === 0) throw new NotFoundError('Esas líneas no son de esta compra');
  const repartidas = lineas.filter((l) => l.cantidadPorRepartir < l.cantidad);
  if (repartidas.length > 0) {
    throw new ConflictError(
      `Ya se repartió parte de ${repartidas.map((l) => l.item.nombre).join(', ')}: no se puede quitar de la compra`
    );
  }
  const { count } = await prisma.purchaseKitItem.deleteMany({ where: { id: { in: lineas.map((l) => l.id) } } });
  return count;
}
