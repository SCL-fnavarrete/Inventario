import type { Prisma, WelcomeKitItem } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import type { CreateAssetInput } from '@/lib/validations/asset';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { crearActivo, descartarActivo } from '@/lib/services/activoService';
import type { AvanceReparto, EstadoReparto } from '@/lib/constants/repartoCompra';

type Tx = Prisma.TransactionClient;

/**
 * Compras (SPEC 2.111): primero se compra, despues se reparte. Lo comprado
 * espera "Por repartir" en la sede de llegada; el reparto lo hace el admin
 * desde la compra. Aqui vive lo que comparten las rutas de una compra.
 */

type CompraBase = { id: string; sedeId: string | null; numeroFactura: string | null; fechaFactura: Date };

// ─── Avance del reparto ──────────────────────────────────────────────────

type LineasParaAvance = {
  purchaseAssets: { llegoConCompra: boolean; asset: { estado: string; deletedAt?: Date | null } }[];
  purchaseKitItems: { cantidad: number; cantidadPorRepartir: number }[];
};

/**
 * Cuanto falta y cuanto ya se repartio, en unidades (equipos + Kit/EPP).
 * Solo cuentan los equipos que llegaron con la compra: uno que ya existia y
 * solo se vinculo a la factura no se reparte. Sin nada repartible, null.
 */
export function avanceReparto(compra: LineasParaAvance): AvanceReparto {
  const equipos = compra.purchaseAssets.filter((pa) => pa.llegoConCompra && !pa.asset.deletedAt);
  const pendiente =
    equipos.filter((pa) => pa.asset.estado === 'por_repartir').length +
    compra.purchaseKitItems.reduce((s, l) => s + l.cantidadPorRepartir, 0);
  const repartido =
    equipos.filter((pa) => pa.asset.estado !== 'por_repartir').length +
    compra.purchaseKitItems.reduce((s, l) => s + (l.cantidad - l.cantidadPorRepartir), 0);
  const estado: EstadoReparto | null =
    pendiente + repartido === 0
      ? null
      : pendiente === 0
        ? 'repartida'
        : repartido === 0
          ? 'por_repartir'
          : 'repartida_en_parte';
  return { pendiente, repartido, estado };
}

/** Compras con algo por repartir (tarjeta y filtro de Compras). */
export const WHERE_COMPRA_POR_REPARTIR: Prisma.PurchaseWhereInput = {
  OR: [
    { purchaseAssets: { some: { llegoConCompra: true, asset: { ...ACTIVOS_VIGENTES, estado: 'por_repartir' } } } },
    { purchaseKitItems: { some: { cantidadPorRepartir: { gt: 0 } } } },
  ],
};

/** Lo que necesitan avanceReparto y las reglas de eliminar/editar. */
export const INCLUDE_AVANCE_REPARTO = {
  purchaseAssets: { select: { llegoConCompra: true, asset: { select: { estado: true, deletedAt: true } } } },
  purchaseKitItems: { select: { cantidad: true, cantidadPorRepartir: true } },
} satisfies Prisma.PurchaseInclude;

/** Rechaza cambiar o eliminar una compra de la que ya se repartio algo. */
export function exigirSinReparto(compra: LineasParaAvance, accion: string) {
  if (avanceReparto(compra).repartido > 0) {
    throw new ConflictError(
      `No se puede ${accion}: ya se repartió parte de lo comprado. La compra es el comprobante de lo que ya está en uso o en camino.`
    );
  }
}

function sedeDeLlegada(compra: CompraBase): string {
  if (!compra.sedeId) throw new ValidationError('La compra no tiene sede de llegada');
  return compra.sedeId;
}

// ─── Equipos ─────────────────────────────────────────────────────────────

/**
 * Equipos comprados: se crean con las reglas de Activos, en la sede de
 * llegada y "Por repartir", con la fecha de la factura como fecha de compra.
 */
export async function agregarEquiposNuevos(
  tx: Tx,
  compra: CompraBase,
  equipos: Omit<CreateAssetInput, 'estado'>[],
  usuario: string
) {
  const sedeId = sedeDeLlegada(compra);
  for (const datos of equipos) {
    const asset = await crearActivo(
      tx,
      { ...datos, fechaCompra: compra.fechaFactura.toISOString() },
      { sedeId, usuario, estado: 'por_repartir' }
    );
    await tx.purchaseAsset.create({
      data: { purchaseId: compra.id, assetId: asset.id, llegoConCompra: true },
    });
    await assetHistoryService.registrarVinculacionCompra(asset.id, compra.numeroFactura, usuario, tx);
  }
}

/**
 * Equipos que ya estaban en el inventario (facturas de equipos antiguos):
 * solo se relacionan con la compra, sin cambiar su estado ni su sede.
 */
export async function vincularEquiposExistentes(
  tx: Tx,
  compra: CompraBase,
  assetIds: string[],
  usuario: string
) {
  const ids = [...new Set(assetIds)];
  const existentes = await tx.asset.findMany({
    where: { ...ACTIVOS_VIGENTES, id: { in: ids } },
    select: { id: true },
  });
  if (existentes.length !== ids.length) throw new NotFoundError('Algunos equipos no existen');

  const yaVinculados = await tx.purchaseAsset.count({
    where: { purchaseId: compra.id, assetId: { in: ids } },
  });
  if (yaVinculados > 0) throw new ConflictError('Algunos equipos ya están vinculados a esta compra');

  await tx.purchaseAsset.createMany({
    data: ids.map((assetId) => ({ purchaseId: compra.id, assetId, llegoConCompra: false })),
  });
  await tx.asset.updateMany({ where: { id: { in: ids } }, data: { fechaCompra: compra.fechaFactura } });
  for (const assetId of ids) {
    await assetHistoryService.registrarVinculacionCompra(assetId, compra.numeroFactura, usuario, tx);
  }
}

/**
 * Quitar un equipo de la compra. Uno que llego con ella y sigue "Por
 * repartir" se descarta (nunca se uso; su historial queda). Uno ya
 * repartido no se quita. Uno solo vinculado se desvincula.
 */
export async function quitarEquipo(
  tx: Tx,
  compra: CompraBase,
  vinculo: { id: string; assetId: string; llegoConCompra: boolean; asset: { estado: string } },
  usuario: string
) {
  if (vinculo.llegoConCompra) {
    if (vinculo.asset.estado !== 'por_repartir') {
      throw new ConflictError('Ese equipo ya se repartió: no se puede quitar de la compra');
    }
    await descartarActivo(
      tx,
      vinculo.assetId,
      `se quitó de la compra${compra.numeroFactura ? ` (factura ${compra.numeroFactura})` : ''} antes de repartirlo`,
      usuario
    );
  }
  await tx.purchaseAsset.delete({ where: { id: vinculo.id } });
}

// ─── Kit/EPP ─────────────────────────────────────────────────────────────

/**
 * Lineas de Kit/EPP compradas: quedan enteras "por repartir"; no suman
 * stock hasta repartirlas (SPEC 2.111.2). Cada articulo es del catalogo de
 * la sede de llegada.
 */
export async function agregarLineasKit(
  tx: Tx,
  compra: CompraBase,
  lineas: { itemId: string; cantidad: number }[]
) {
  const sedeId = sedeDeLlegada(compra);
  const ids = [...new Set(lineas.map((l) => l.itemId))];
  const items = await tx.welcomeKitItem.findMany({ where: { id: { in: ids } }, select: { id: true, sedeId: true } });
  if (items.length !== ids.length) throw new NotFoundError('Algunos artículos de Kit/EPP no existen');
  if (items.some((i) => i.sedeId !== sedeId)) {
    throw new ValidationError('Los artículos de Kit/EPP deben ser del catálogo de la sede de llegada');
  }
  for (const l of lineas) {
    await tx.purchaseKitItem.create({
      data: { purchaseId: compra.id, itemId: l.itemId, cantidad: l.cantidad, cantidadPorRepartir: l.cantidad },
    });
  }
}

/**
 * El mismo articulo (nombre y categoria) en el catalogo de otra sede, o uno
 * nuevo sin stock si esa sede no lo tiene. Cada sede tiene su catalogo, asi
 * que es la forma de llevar Kit/EPP de una sede a otra.
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

/**
 * Cambiar la sede de llegada (solo si nada se repartio): lo que espera
 * "Por repartir" esta fisicamente en la nueva sede, asi que sus equipos se
 * mueven y sus lineas de Kit/EPP pasan al mismo articulo en esa sede.
 */
export async function moverSedeDeLlegada(tx: Tx, compraId: string, nuevaSedeId: string) {
  const vinculos = await tx.purchaseAsset.findMany({
    where: { purchaseId: compraId, llegoConCompra: true, asset: { estado: 'por_repartir' } },
    select: { assetId: true },
  });
  if (vinculos.length > 0) {
    await tx.asset.updateMany({
      where: { id: { in: vinculos.map((v) => v.assetId) } },
      data: { sedeId: nuevaSedeId },
    });
  }
  const lineas = await tx.purchaseKitItem.findMany({ where: { purchaseId: compraId }, include: { item: true } });
  for (const linea of lineas) {
    if (linea.item.sedeId === nuevaSedeId) continue;
    const destino = await articuloKitEnSede(tx, linea.item, nuevaSedeId);
    await tx.purchaseKitItem.update({ where: { id: linea.id }, data: { itemId: destino.id } });
  }
}
