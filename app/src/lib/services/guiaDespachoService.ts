import { prisma } from '@/lib/prisma';
import { Prisma, type EstadoActivo } from '@prisma/client';
import { hoyISO } from '@/lib/utils/fechas';
import { ConflictError, NotFoundError, ValidationError, errorDeCampo } from '@/lib/errors';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { auditLogService } from '@/lib/services/auditLogService';
import { formatearRut } from '@/lib/validations/rut';
import { articuloKitEnSede, estadoLineaKit, sumarStockKit } from '@/lib/services/kitService';

type PrismaOCliente = typeof prisma | Prisma.TransactionClient;

/**
 * Calcula el próximo número de guía de despacho (formato GD-<año>-NNNNN).
 * El año es el de Chile: en el servidor (UTC) el 31 de diciembre desde las
 * 21:00 ya seria el año siguiente.
 */
export async function generarNumeroGuia(cliente: PrismaOCliente = prisma): Promise<string> {
  const year = hoyISO().slice(0, 4);

  const lastGuide = await cliente.dispatchGuide.findFirst({
    where: {
      numero: {
        startsWith: `GD-${year}-`,
      },
    },
    orderBy: { numero: 'desc' },
  });

  let nextNumber = 1;
  if (lastGuide) {
    const lastNumber = parseInt(lastGuide.numero.split('-')[2]);
    nextNumber = lastNumber + 1;
  }

  return `GD-${year}-${nextNumber.toString().padStart(5, '0')}`;
}

const INTENTOS_NUMERO = 3;

/** ¿El error es el numero de guia repetido (indice unico de `numero`)? */
function esNumeroRepetido(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }
  const campos = (error.meta?.target as string[] | string | undefined) ?? [];
  return String(campos).includes('numero');
}

/**
 * Crea la guia dentro de una transaccion con su numero (SPEC 2.108). El
 * numero se calcula dentro de la misma transaccion y, si otra guia creada al
 * mismo tiempo ya lo tomo, se reintenta con el siguiente. Antes se calculaba
 * afuera y dos guias simultaneas chocaban con un error confuso.
 */
export async function crearGuiaConNumero<T>(
  crear: (numero: string, tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  for (let intento = 1; ; intento++) {
    try {
      return await prisma.$transaction(async (tx) => crear(await generarNumeroGuia(tx), tx));
    } catch (error) {
      if (intento < INTENTOS_NUMERO && esNumeroRepetido(error)) continue;
      throw error;
    }
  }
}

type GuiaParaMover = {
  id: string;
  numero: string;
  sedeId: string | null;
  sedeDestinoId: string;
  sedeDestino: { nombre: string };
  sede: { nombre: string } | null;
};

/**
 * Equipos que llegaron (SPEC 2.108): pasan a la sede destino como
 * "Disponible" y el equipo de la guia queda recibido. Solo los que siguen en
 * transito; los demas se ignoran.
 */
export async function recibirEquipos(
  tx: Prisma.TransactionClient,
  guia: GuiaParaMover,
  itemIds: string[],
  usuario: string
) {
  const items = await tx.dispatchGuideItem.findMany({
    where: { guideId: guia.id, id: { in: itemIds }, estado: 'en_transito' },
    select: { id: true, assetId: true },
  });
  const ahora = new Date();
  for (const item of items) {
    await tx.dispatchGuideItem.update({
      where: { id: item.id },
      data: { estado: 'recibido', fechaResolucion: ahora, resueltoPor: usuario },
    });
    await tx.asset.update({
      where: { id: item.assetId },
      data: { estado: 'disponible', sedeId: guia.sedeDestinoId },
    });
    await tx.assetHistory.create({
      data: {
        assetId: item.assetId,
        tipoEvento: 'traslado',
        descripcion: `Llegó a ${guia.sedeDestino.nombre} (despacho ${guia.numero}): queda Disponible ahí`,
        datosAnteriores: { estado: 'en_transito', sedeId: guia.sedeId },
        datosNuevos: { estado: 'disponible', sedeId: guia.sedeDestinoId, guideId: guia.id },
        usuarioSistema: usuario,
      },
    });
  }
  return items.length;
}

/**
 * Estado de la guia segun sus equipos, despues de una recepcion o de
 * resolver un faltante: si alguno sigue en transito, "con faltantes"; si no,
 * "recibida". Una guia que aun no se recibe sigue "en transito".
 */
export async function actualizarEstadoGuia(
  tx: Prisma.TransactionClient,
  guiaId: string,
  yaRecibida: boolean
) {
  // Equipos y lineas de Kit/EPP que todavia no se resuelven (SPEC 2.111.4).
  const [equipos, kit] = await Promise.all([
    tx.dispatchGuideItem.count({ where: { guideId: guiaId, estado: 'en_transito' } }),
    tx.dispatchGuideKitItem.count({ where: { guideId: guiaId, estado: 'en_transito' } }),
  ]);
  const pendientes = equipos + kit;
  const estado = pendientes === 0 ? 'recibida' : yaRecibida ? 'recibida_parcial' : 'en_transito';
  await tx.dispatchGuide.update({ where: { id: guiaId }, data: { estado } });
  return estado;
}

/** Lo que el detalle de una guia muestra y sus acciones necesitan. */
export const INCLUDE_DETALLE_GUIA = {
  items: {
    include: { asset: { include: { categoria: true } } },
    orderBy: { createdAt: 'asc' },
  },
  // Kit/EPP del despacho (SPEC 2.111.4)
  kitItems: {
    include: { item: true, itemDestino: { select: { id: true, nombre: true, cantidad: true } } },
    orderBy: { createdAt: 'asc' },
  },
  // Compra de origen, si el despacho viene de un reparto (SPEC 2.111)
  purchase: { select: { id: true, numeroFactura: true } },
  sede: true,
  sedeDestino: true,
} satisfies Prisma.DispatchGuideInclude;

/**
 * La guia con su detalle, o 404 si no existe. Punto de entrada de todas las
 * rutas de una guia.
 */
export async function buscarGuia(id: string) {
  const guia = await prisma.dispatchGuide.findUnique({ where: { id }, include: INCLUDE_DETALLE_GUIA });
  if (!guia) throw new NotFoundError('Despacho no encontrado');
  return guia;
}

// ─── Crear un despacho ───────────────────────────────────────────────────

/** Datos del envio, ya validados con validarDatosDespacho. */
export type DatosEnvio = {
  otChilexpress: string;
  fechaDespacho: string;
  fechaEstimadaLlegada?: string | null;
  receptorNombre: string;
  receptorRut: string;
  observaciones?: string | null;
};

/**
 * La sede destino existe, esta activa y no es la de origen (SPEC 2.108). La
 * usan el despacho del modulo y el reparto de una compra (SPEC 2.111).
 */
export async function sedeDestinoValida(sedeDestinoId: string, sedeOrigenId: string | null) {
  const sede = await prisma.sede.findUnique({ where: { id: sedeDestinoId } });
  if (!sede) throw errorDeCampo('sedeDestinoId', 'La sede destino no existe');
  if (!sede.activa) throw errorDeCampo('sedeDestinoId', `La sede ${sede.nombre} está inactiva`);
  if (sedeOrigenId && sede.id === sedeOrigenId) {
    throw errorDeCampo('sedeDestinoId', 'La sede destino debe ser distinta de la sede origen');
  }
  return sede;
}

/**
 * Crea el despacho dentro de la transaccion de crearGuiaConNumero: la guia
 * "En transito", sus equipos y su Kit/EPP, el paso de cada equipo a "En
 * transito" (validado con la maquina de estados) y el historial. Unico
 * punto de creacion: lo usan POST /api/guias-despacho (equipos disponibles)
 * y el reparto de una compra (equipos "Por repartir" y Kit/EPP, SPEC 2.111).
 *
 * Cada equipo se actualiza solo si sigue en el estado con que se eligio: si
 * otro lo movio mientras tanto, se cancela todo.
 */
export async function crearDespacho(
  tx: Prisma.TransactionClient,
  numero: string,
  d: {
    envio: DatosEnvio;
    sedeId: string | null;
    sedeDestino: { id: string; nombre: string };
    equipos: { id: string; estado: EstadoActivo; sedeId: string | null }[];
    kit?: { itemId: string; cantidad: number }[];
    purchaseId?: string;
    emisor: string;
    usuario: string;
  }
) {
  const guia = await tx.dispatchGuide.create({
    data: {
      numero,
      otChilexpress: d.envio.otChilexpress,
      fechaDespacho: new Date(d.envio.fechaDespacho),
      fechaEstimadaLlegada: d.envio.fechaEstimadaLlegada ? new Date(d.envio.fechaEstimadaLlegada) : null,
      despachadoPor: d.emisor,
      receptorNombre: d.envio.receptorNombre,
      receptorRut: formatearRut(d.envio.receptorRut),
      observaciones: d.envio.observaciones || null,
      estado: 'en_transito',
      sedeId: d.sedeId,
      sedeDestinoId: d.sedeDestino.id,
      purchaseId: d.purchaseId ?? null,
      items: { create: d.equipos.map((e) => ({ assetId: e.id })) },
      kitItems: { create: (d.kit ?? []).map((k) => ({ itemId: k.itemId, cantidad: k.cantidad })) },
    },
    include: {
      items: { include: { asset: { include: { categoria: true } } } },
      sedeDestino: true,
    },
  });

  await auditLogService.registrarCreacion(
    'guia_despacho',
    guia.id,
    `Despacho creado: ${guia.numero} (OT ${d.envio.otChilexpress})`,
    {
      sedeId: d.sedeId,
      sedeDestinoId: d.sedeDestino.id,
      cantidadEquipos: d.equipos.length,
      lineasKit: d.kit?.length ?? 0,
      purchaseId: d.purchaseId ?? null,
    },
    d.usuario,
    tx
  );

  for (const equipo of d.equipos) {
    const transicion = validateTransition(equipo.estado, 'en_transito', {
      hasActiveAssignment: false,
      hasActiveMaintenance: false,
    });
    if (!transicion.valid) throw new ConflictError(transicion.errors[0]);

    // Sigue en su sede hasta que llegue (SPEC 2.108).
    const { count } = await tx.asset.updateMany({
      where: { id: equipo.id, estado: equipo.estado, deletedAt: null },
      data: { estado: 'en_transito' },
    });
    if (count !== 1) {
      throw new ConflictError('Un equipo cambió de estado mientras se preparaba el despacho. Vuelve a intentarlo.');
    }
    await assetHistoryService.registrar(
      {
        assetId: equipo.id,
        tipoEvento: 'traslado',
        descripcion: `Despachado a ${d.sedeDestino.nombre} en el despacho ${guia.numero} (OT Chilexpress ${d.envio.otChilexpress}): en tránsito`,
        datosAnteriores: { estado: equipo.estado, sedeId: equipo.sedeId },
        datosNuevos: { estado: 'en_transito', guideId: guia.id, sedeDestinoId: d.sedeDestino.id },
        usuarioSistema: d.usuario,
      },
      tx
    );
  }

  return guia;
}

// ─── Kit/EPP de un despacho (SPEC 2.111.4) ───────────────────────────────

export type AccionKit = 'llego' | 'perdido' | 'aparecio';

/**
 * Resuelve unidades de una linea de Kit/EPP de un despacho:
 * - "llego": pasan de pendientes a recibidas y suman stock en la sede
 *   destino (al mismo articulo por nombre y categoria; se crea si esa sede
 *   no lo tiene). Lo usan la recepcion y el faltante que llega despues.
 * - "perdido": pasan de pendientes a perdidas, con su motivo. No hay baja:
 *   el Kit/EPP es stock, no un equipo con ficha.
 * - "aparecio": pasan de perdidas a recibidas y suman stock.
 * La linea se actualiza solo si sigue como se leyo (dos personas a la vez).
 */
export async function resolverKit(
  tx: Prisma.TransactionClient,
  guia: { id: string; numero: string; sedeDestinoId: string },
  lineaId: string,
  accion: AccionKit,
  cantidad: number,
  usuario: string,
  motivo?: string
) {
  const linea = await tx.dispatchGuideKitItem.findFirst({
    where: { id: lineaId, guideId: guia.id },
    include: { item: true },
  });
  if (!linea) throw new NotFoundError('Ese artículo no es de este despacho');

  const pendiente = linea.cantidad - linea.cantidadRecibida - linea.cantidadPerdida;
  const disponible = accion === 'aparecio' ? linea.cantidadPerdida : pendiente;
  // Una cantidad fuera de rango es un dato mal ingresado (400), marcado en su campo.
  const errorCantidad = (m: string) => new ValidationError(m, [{ field: 'cantidad', message: m }]);
  if (!Number.isInteger(cantidad) || cantidad < 1) throw errorCantidad('La cantidad debe ser al menos 1');
  if (cantidad > disponible) {
    throw errorCantidad(
      accion === 'aparecio'
        ? `De ${linea.item.nombre} hay ${disponible} perdido(s)`
        : `De ${linea.item.nombre} quedan ${disponible} pendiente(s)`
    );
  }

  const recibida = linea.cantidadRecibida + (accion === 'perdido' ? 0 : cantidad);
  const perdida =
    linea.cantidadPerdida + (accion === 'perdido' ? cantidad : accion === 'aparecio' ? -cantidad : 0);

  // Stock en la sede destino, salvo que se pierda.
  let itemDestinoId = linea.itemDestinoId;
  if (accion !== 'perdido') {
    if (!itemDestinoId) itemDestinoId = (await articuloKitEnSede(tx, linea.item, guia.sedeDestinoId)).id;
    await sumarStockKit(
      tx,
      itemDestinoId,
      cantidad,
      accion === 'aparecio' ? `Apareció en el despacho ${guia.numero}` : `Llegó en el despacho ${guia.numero}`,
      usuario
    );
  }

  const motivoPerdida =
    accion === 'perdido'
      ? [linea.motivoPerdida, `${cantidad}: ${motivo}`].filter(Boolean).join(' | ')
      : linea.motivoPerdida;

  const { count } = await tx.dispatchGuideKitItem.updateMany({
    where: { id: linea.id, cantidadRecibida: linea.cantidadRecibida, cantidadPerdida: linea.cantidadPerdida },
    data: {
      cantidadRecibida: recibida,
      cantidadPerdida: perdida,
      estado: estadoLineaKit({ cantidad: linea.cantidad, cantidadRecibida: recibida, cantidadPerdida: perdida }),
      itemDestinoId,
      motivoPerdida,
      fechaResolucion: new Date(),
      resueltoPor: usuario,
    },
  });
  if (count !== 1) {
    throw new ConflictError('Otra persona actualizó este artículo del despacho. Vuelve a cargar la página.');
  }
  return { nombre: linea.item.nombre };
}
