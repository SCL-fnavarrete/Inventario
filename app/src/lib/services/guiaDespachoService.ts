import { prisma } from '@/lib/prisma';
import { Prisma, type EstadoActivo } from '@prisma/client';
import { hoyISO } from '@/lib/utils/fechas';
import { ConflictError, NotFoundError, errorDeCampo } from '@/lib/errors';
import { validateTransition } from '@/lib/services/assetStateMachine';
import { assetHistoryService } from '@/lib/services/assetHistoryService';
import { auditLogService } from '@/lib/services/auditLogService';
import { formatearRut } from '@/lib/validations/rut';
import { puedeVerGuia } from '@/lib/queries/guias';
import type { SesionAutenticada } from '@/lib/auth/guard';

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
  const pendientes = await tx.dispatchGuideItem.count({
    where: { guideId: guiaId, estado: 'en_transito' },
  });
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
  sede: true,
  sedeDestino: true,
} satisfies Prisma.DispatchGuideInclude;

/**
 * La guia con su detalle, o 404 si no existe o la sesion no la puede ver
 * (regla puedeVerGuia). Punto de entrada de todas las rutas de una guia.
 */
export async function buscarGuiaVisible(session: SesionAutenticada, id: string) {
  const guia = await prisma.dispatchGuide.findUnique({ where: { id }, include: INCLUDE_DETALLE_GUIA });
  if (!guia || !puedeVerGuia(session, guia)) throw new NotFoundError('Despacho no encontrado');
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
