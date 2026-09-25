import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { hoyISO } from '@/lib/utils/fechas';
import { NotFoundError } from '@/lib/errors';
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
