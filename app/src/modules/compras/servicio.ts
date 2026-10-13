import type { Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errores';
import { ACTIVOS_VIGENTES } from '@/modules/activos';
import type { CreateAssetInput } from '@/modules/activos';
import type {
  CreatePurchaseWithAssetsInput,
  RepartoCompraInput,
  UpdatePurchaseInput,
} from '@/modules/compras/validaciones';
import { validarDatosDespacho } from '@/modules/despachos';
import { auditLogService } from '@/shared/auditoria';
import { articuloKitEnSede, sumarStockKit } from '@/modules/kit-epp/servidor';
import {
  crearDespacho,
  crearGuiaConNumero,
  sedeDestinoValida,
  type DatosEnvio,
} from '@/modules/despachos/servidor';
import {
  assetHistoryService,
  cambiarEstado,
  crearActivo,
  descartarActivo,
  fijarFechaCompra,
  moverSedeDeCompra,
} from '@/modules/activos/servidor';
import type { AvanceReparto, EstadoReparto } from '@/modules/compras/reparto';

type Tx = Prisma.TransactionClient;

/**
 * Compras (SPEC 2.111): primero se compra, despues se reparte. Lo comprado
 * espera "Por repartir" en la sede de llegada; el reparto se hace
 * desde la compra (admin y técnico). Aqui vive lo que comparten las rutas de una compra.
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
/**
 * Compras muestra los equipos comprados y a que sede se repartieron, no a
 * quien estan asignados (SPEC 2.111.6, decision de Javier del 28-sep-2026):
 * se quita tambien el id del empleado, que delataria la asignacion.
 */
export function sinAsignacion<T extends { empleadoActualId?: string | null }>(
  asset: T
): Omit<T, 'empleadoActualId'> {
  const { empleadoActualId, ...resto } = asset;
  return resto;
}

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
  await fijarFechaCompra(tx, ids, compra.fechaFactura);
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
    await moverSedeDeCompra(tx, vinculos.map((v) => v.assetId), nuevaSedeId);
  }
  const lineas = await tx.purchaseKitItem.findMany({ where: { purchaseId: compraId }, include: { item: true } });
  for (const linea of lineas) {
    if (linea.item.sedeId === nuevaSedeId) continue;
    const destino = await articuloKitEnSede(tx, linea.item, nuevaSedeId);
    await tx.purchaseKitItem.update({ where: { id: linea.id }, data: { itemId: destino.id } });
  }
}

// ─── Repartir (SPEC 2.111.3) ─────────────────────────────────────────────

/**
 * Reparte parte de una compra a una sede.
 * - A la sede de llegada: los equipos pasan a "Disponible" y el Kit/EPP suma
 *   al stock de esa sede, en el momento.
 * - A otra sede: se crea un despacho (el mismo crearDespacho del modulo)
 *   desde la sede de llegada, vinculado a la compra, con los equipos y el
 *   Kit/EPP. El stock se suma en la sede destino al recibirlo.
 * En ambos casos baja lo pendiente de la compra y queda a donde fue cada
 * parte del Kit/EPP. Todo en una transaccion.
 */
export async function repartirCompra(
  compraId: string,
  datos: RepartoCompraInput,
  quien: { emisor: string; usuario: string }
) {
  const compra = await prisma.purchase.findUnique({
    where: { id: compraId },
    include: {
      sede: { select: { id: true, nombre: true } },
      purchaseAssets: {
        include: {
          asset: { select: { id: true, estado: true, sedeId: true, deletedAt: true, marca: true, modelo: true } },
        },
      },
      purchaseKitItems: { include: { item: true } },
    },
  });
  if (!compra) throw new NotFoundError('Compra no encontrada');
  const sedeLlegada = sedeDeLlegada(compra);

  // Equipos: comprados en esta compra y todavia "Por repartir".
  const vinculos = new Map(compra.purchaseAssets.map((pa) => [pa.assetId, pa]));
  const equipos = [...new Set(datos.equipos)].map((id) => {
    const pa = vinculos.get(id);
    if (!pa || !pa.llegoConCompra || pa.asset.deletedAt) {
      throw new ValidationError('Uno de los equipos no es de esta compra');
    }
    if (pa.asset.estado !== 'por_repartir') {
      throw new ConflictError(`${pa.asset.marca} ${pa.asset.modelo} ya se repartió`);
    }
    return pa.asset;
  });

  // Kit/EPP: cada cantidad dentro de lo que falta repartir de su linea.
  const lineas = new Map(compra.purchaseKitItems.map((l) => [l.id, l]));
  const kit = datos.kit.map(({ lineaId, cantidad }) => {
    const linea = lineas.get(lineaId);
    if (!linea) throw new ValidationError('Una de las líneas de Kit/EPP no es de esta compra');
    if (cantidad > linea.cantidadPorRepartir) {
      throw new ValidationError(
        `De ${linea.item.nombre} quedan ${linea.cantidadPorRepartir} por repartir; no se pueden repartir ${cantidad}`
      );
    }
    return { linea, cantidad };
  });

  const factura = compra.numeroFactura ? `factura ${compra.numeroFactura}` : 'compra sin número';
  const resumen = `${equipos.length} equipo(s) y ${kit.reduce((s, k) => s + k.cantidad, 0)} unidad(es) de Kit/EPP`;

  // Baja lo pendiente de la linea solo si todavia alcanza: si otro reparto
  // se adelanto, se cancela todo.
  const descontar = async (tx: Tx, lineaId: string, cantidad: number) => {
    const { count } = await tx.purchaseKitItem.updateMany({
      where: { id: lineaId, cantidadPorRepartir: { gte: cantidad } },
      data: { cantidadPorRepartir: { decrement: cantidad } },
    });
    if (count !== 1) {
      throw new ConflictError('Otro reparto cambió lo pendiente de esta compra. Vuelve a intentarlo.');
    }
  };

  if (datos.sedeDestinoId === sedeLlegada) {
    await prisma.$transaction(async (tx) => {
      for (const equipo of equipos) {
        await cambiarEstado(tx, {
          activo: { id: equipo.id, estado: 'por_repartir' },
          a: 'disponible',
          mensajeConflicto: 'Un equipo cambió de estado mientras se repartía. Vuelve a intentarlo.',
          historial: {
            tipoEvento: 'cambio_estado',
            descripcion: `Repartido a ${compra.sede?.nombre ?? 'la sede de llegada'} (${factura}): queda Disponible`,
            datosAnteriores: { estado: 'por_repartir' },
            datosNuevos: { estado: 'disponible', purchaseId: compra.id },
            usuarioSistema: quien.usuario,
          },
        });
      }
      for (const { linea, cantidad } of kit) {
        await descontar(tx, linea.id, cantidad);
        await sumarStockKit(tx, linea.itemId, cantidad, `Stock repartido desde la compra (${factura})`, quien.usuario);
        await tx.purchaseKitReparto.create({
          data: { purchaseKitItemId: linea.id, sedeId: sedeLlegada, cantidad, repartidoPor: quien.usuario },
        });
      }
      await auditLogService.registrarActualizacion(
        'compra',
        compra.id,
        `Reparto a ${compra.sede?.nombre ?? 'la sede de llegada'}: ${resumen}`,
        {},
        { sedeDestinoId: sedeLlegada, equipos: equipos.length },
        quien.usuario,
        tx
      );
    });
    return { despacho: null };
  }

  // A otra sede: con un despacho, igual que el modulo de Despachos.
  const errores = validarDatosDespacho({ ...datos.envio, sedeDestinoId: datos.sedeDestinoId });
  if (Object.keys(errores).length > 0) {
    throw new ValidationError(
      'Faltan o están incorrectos datos del despacho',
      Object.entries(errores).map(([field, message]) => ({ field, message }))
    );
  }
  const envio = datos.envio as DatosEnvio;
  const sedeDestino = await sedeDestinoValida(datos.sedeDestinoId, sedeLlegada);

  const despacho = await crearGuiaConNumero(async (numero, tx) => {
    const guia = await crearDespacho(tx, numero, {
      envio,
      sedeId: sedeLlegada,
      sedeDestino,
      equipos: equipos.map((e) => ({ id: e.id, estado: e.estado, sedeId: e.sedeId })),
      kit: kit.map((k) => ({ itemId: k.linea.itemId, cantidad: k.cantidad })),
      purchaseId: compra.id,
      emisor: quien.emisor,
      usuario: quien.usuario,
    });
    for (const { linea, cantidad } of kit) {
      await descontar(tx, linea.id, cantidad);
      await tx.purchaseKitReparto.create({
        data: {
          purchaseKitItemId: linea.id,
          sedeId: sedeDestino.id,
          cantidad,
          guideId: guia.id,
          repartidoPor: quien.usuario,
        },
      });
    }
    await auditLogService.registrarActualizacion(
      'compra',
      compra.id,
      `Reparto a ${sedeDestino.nombre} en el despacho ${guia.numero}: ${resumen}`,
      {},
      { sedeDestinoId: sedeDestino.id, guideId: guia.id, equipos: equipos.length },
      quien.usuario,
      tx
    );
    return guia;
  });
  return { despacho: { id: despacho.id, numero: despacho.numero } };
}

// ─── Editar y eliminar la compra ──────────────────────────────────────────

/**
 * Editar los datos de la factura (PUT /api/compras/[id]). La sede de
 * llegada solo cambia mientras no se haya repartido nada, y lo que espera
 * "Por repartir" se mueve con ella. El N° de factura es unico.
 */
export async function editarCompra(
  id: string,
  data: UpdatePurchaseInput,
  usuario: string | null | undefined
) {
  const existente = await prisma.purchase.findUnique({ where: { id }, include: INCLUDE_AVANCE_REPARTO });
  if (!existente) throw new NotFoundError('Compra no encontrada');

  if (data.sedeId === null) {
    throw new ValidationError('Elige la sede de llegada', [
      { field: 'sedeId', message: 'Elige la sede de llegada' },
    ]);
  }
  const cambiaSede = !!data.sedeId && data.sedeId !== existente.sedeId;
  if (cambiaSede) {
    exigirSinReparto(existente, 'cambiar la sede de llegada');
    const sede = await prisma.sede.findUnique({ where: { id: data.sedeId! } });
    if (!sede) throw new NotFoundError('La sede de llegada no existe');
  }

  // Una factura no puede quedar sin numero; solo un gasto menor.
  const tipoFinal = data.tipoCompra ?? existente.tipoCompra;
  const numeroFinal = data.numeroFactura === undefined ? existente.numeroFactura : data.numeroFactura;
  if (tipoFinal === 'FACTURA' && !numeroFinal?.trim()) {
    throw new ValidationError('Datos inválidos', [
      { field: 'numeroFactura', message: 'Escribe el número de factura' },
    ]);
  }

  if (data.numeroFactura) {
    const duplicada = await prisma.purchase.findFirst({
      where: { numeroFactura: data.numeroFactura, id: { not: id } },
      select: { id: true },
    });
    if (duplicada) {
      throw new ValidationError('Datos inválidos', [
        { field: 'numeroFactura', message: `Ya existe otra compra con la factura ${data.numeroFactura}.` },
      ]);
    }
  }

  return prisma.$transaction(async (tx) => {
    if (cambiaSede) await moverSedeDeLlegada(tx, id, data.sedeId!);

    const actualizada = await tx.purchase.update({
      where: { id },
      data: {
        ...(cambiaSede && { sedeId: data.sedeId }),
        ...(data.numeroFactura !== undefined && { numeroFactura: data.numeroFactura }),
        ...(data.fechaFactura !== undefined && { fechaFactura: data.fechaFactura }),
        ...(data.rutProveedor !== undefined && { rutProveedor: data.rutProveedor }),
        ...(data.tipoCompra !== undefined && { tipoCompra: data.tipoCompra }),
        ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
        ...(data.compradoPor !== undefined && { compradoPor: data.compradoPor }),
        ...(data.ordenCompra !== undefined && { ordenCompra: data.ordenCompra }),
      },
      include: { sede: { select: { id: true, nombre: true, codigo: true } } },
    });

    const resumen = (c: typeof existente | typeof actualizada) => ({
      numeroFactura: c.numeroFactura,
      rutProveedor: c.rutProveedor,
      tipoCompra: c.tipoCompra,
      sedeId: c.sedeId,
    });
    await auditLogService.registrarActualizacion(
      'compra',
      actualizada.id,
      `Compra actualizada: factura ${actualizada.numeroFactura}`,
      resumen(existente),
      resumen(actualizada),
      usuario,
      tx
    );
    return actualizada;
  });
}

/**
 * Eliminar una compra (DELETE /api/compras/[id]), solo si no se repartio
 * nada (SPEC 2.111.7). Sus equipos "Por repartir" se descartan (nunca se
 * usaron; el historial los conserva) y sus lineas de Kit/EPP se borran:
 * todavia no habian sumado stock.
 */
export async function eliminarCompra(id: string, usuario: string) {
  const compra = await prisma.purchase.findUnique({
    where: { id },
    include: {
      purchaseAssets: { include: { asset: { select: { estado: true, deletedAt: true } } } },
      purchaseKitItems: true,
    },
  });
  if (!compra) throw new NotFoundError('Compra no encontrada');
  exigirSinReparto(compra, 'eliminar la compra');

  await prisma.$transaction(async (tx) => {
    for (const vinculo of compra.purchaseAssets) {
      if (vinculo.asset.deletedAt) {
        await tx.purchaseAsset.delete({ where: { id: vinculo.id } });
      } else {
        await quitarEquipo(tx, compra, vinculo, usuario);
      }
    }
    await tx.purchaseKitItem.deleteMany({ where: { purchaseId: id } });

    // Auditoria antes del delete fisico: es lo unico que queda de la compra.
    await auditLogService.registrarEliminacion(
      'compra',
      compra.id,
      `Compra eliminada: factura ${compra.numeroFactura}`,
      {
        numeroFactura: compra.numeroFactura,
        rutProveedor: compra.rutProveedor,
        tipoCompra: compra.tipoCompra,
        sedeId: compra.sedeId,
        cantidadActivosVinculados: compra.purchaseAssets.length,
        cantidadArticulosKitVinculados: compra.purchaseKitItems.length,
      },
      usuario,
      tx
    );
    await tx.purchase.delete({ where: { id } });
  });
}

/**
 * Registrar una compra (POST /api/compras, SPEC 2.111.1; admin y técnico). Lo
 * comprado queda "Por repartir" en la sede de llegada: los equipos nuevos se
 * crean aqui mismo y el Kit/EPP no suma stock hasta repartirlo. Todo en una
 * transaccion: si un equipo no se puede crear (N° de serie repetido), no
 * queda ni la compra ni el resto.
 */
export async function registrarCompra(data: CreatePurchaseWithAssetsInput, usuario: string) {
  const sede = await prisma.sede.findUnique({ where: { id: data.sedeId } });
  if (!sede) throw new NotFoundError('La sede de llegada no existe');
  // N° de factura unico en todo el sistema (opcional: solo si viene).
  if (data.numeroFactura) {
    const duplicada = await prisma.purchase.findFirst({
      where: { numeroFactura: data.numeroFactura },
      select: { id: true },
    });
    if (duplicada) {
      throw new ValidationError('Datos inválidos', [
        { field: 'numeroFactura', message: `Ya existe una compra con la factura ${data.numeroFactura}.` },
      ]);
    }
  }

  const compra = await prisma.$transaction(async (tx) => {
    const nueva = await tx.purchase.create({
      data: {
        sedeId: data.sedeId,
        numeroFactura: data.numeroFactura,
        fechaFactura: data.fechaFactura,
        rutProveedor: data.rutProveedor,
        descripcion: data.descripcion,
        compradoPor: data.compradoPor,
        ordenCompra: data.ordenCompra,
        tipoCompra: data.tipoCompra,
      },
    });
    await auditLogService.registrarCreacion(
      'compra',
      nueva.id,
      `Compra creada: factura ${nueva.numeroFactura}`,
      {
        numeroFactura: nueva.numeroFactura,
        rutProveedor: nueva.rutProveedor,
        tipoCompra: nueva.tipoCompra,
        sedeId: nueva.sedeId,
        equiposNuevos: data.equiposNuevos.length,
        equiposVinculados: data.assets.length,
        lineasKit: data.kitItems.length,
      },
      usuario,
      tx
    );
    await agregarEquiposNuevos(tx, nueva, data.equiposNuevos, usuario);
    if (data.assets.length > 0) {
      await vincularEquiposExistentes(tx, nueva, data.assets.map((a) => a.assetId), usuario);
    }
    if (data.kitItems.length > 0) await agregarLineasKit(tx, nueva, data.kitItems);
    return tx.purchase.findUniqueOrThrow({
      where: { id: nueva.id },
      include: { sede: { select: { id: true, nombre: true, codigo: true } }, ...INCLUDE_AVANCE_REPARTO },
    });
  });
  return { ...compra, reparto: avanceReparto(compra) };
}

/**
 * Se anulo un despacho de reparto (SPEC 2.111.5): su Kit/EPP vuelve a lo
 * pendiente de la linea de compra, para repartirlo de nuevo. El registro del
 * reparto queda, con el despacho anulado. Lo llama Despachos al anular.
 */
export async function devolverKitDeRepartoAnulado(tx: Tx, guideId: string) {
  const repartos = await tx.purchaseKitReparto.findMany({ where: { guideId } });
  for (const r of repartos) {
    await tx.purchaseKitItem.update({
      where: { id: r.purchaseKitItemId },
      data: { cantidadPorRepartir: { increment: r.cantidad } },
    });
  }
}
