import type { EstadoGuia, Prisma } from '@prisma/client';
import { prisma } from '@/shared/prisma';
import { coincideBusqueda } from '@/shared/utilidades/text';
import { ordenarComo, paginarCoincidencias } from '@/shared/utilidades/busquedaEnMemoria';
import { VISTAS_GUIA, type VistaGuia } from '@/modules/despachos/consultas';

/** La sede del menu filtra por AMBAS puntas: una guia interesa a la que despacha y a la que recibe. */
const porSede = (sedeId: string): Prisma.DispatchGuideWhereInput[] =>
  sedeId ? [{ OR: [{ sedeId }, { sedeDestinoId: sedeId }] }] : [];

/**
 * Lista de despachos (GET /api/guias-despacho). La busqueda se filtra en
 * memoria: normaliza el RUT del receptor (se guarda formateado) e ignora
 * acentos en los demas campos.
 */
export async function listarDespachos(p: {
  estado: EstadoGuia | null;
  busqueda: string;
  vista: VistaGuia | null;
  sedeId: string;
  page: number;
  limit: number;
}) {
  const condiciones: Prisma.DispatchGuideWhereInput[] = [];
  if (p.estado) condiciones.push({ estado: p.estado });
  // Tarjeta pulsada (SPEC 2.108): misma condicion que cuenta la tarjeta.
  if (p.vista && p.vista in VISTAS_GUIA) {
    condiciones.push(p.vista === 'por_recibir' ? VISTAS_GUIA.por_recibir(p.sedeId || null) : VISTAS_GUIA[p.vista]());
  }
  condiciones.push(...porSede(p.sedeId));
  const where = { AND: condiciones };
  const include = { _count: { select: { items: true, kitItems: true } }, sede: true, sedeDestino: true } as const;

  let data;
  let total;
  const termino = p.busqueda.trim();
  if (termino) {
    // Solo las columnas de busqueda; el detalle, solo de la pagina.
    const candidatas = await prisma.dispatchGuide.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true, numero: true, otChilexpress: true, receptorNombre: true, receptorRut: true },
    });
    const pagina = paginarCoincidencias(
      candidatas,
      (g) => coincideBusqueda(termino, { rut: g.receptorRut, campos: [g.numero, g.otChilexpress, g.receptorNombre] }),
      (p.page - 1) * p.limit,
      p.limit
    );
    total = pagina.total;
    data = ordenarComo(pagina.ids, await prisma.dispatchGuide.findMany({ where: { id: { in: pagina.ids } }, include }));
  } else {
    [data, total] = await Promise.all([
      prisma.dispatchGuide.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (p.page - 1) * p.limit,
        take: p.limit,
      }),
      prisma.dispatchGuide.count({ where }),
    ]);
  }
  return { data, pagination: { page: p.page, limit: p.limit, total, totalPages: Math.ceil(total / p.limit) } };
}

/**
 * Tarjetas de Despachos (GET /api/guias-despacho/resumen): cada una cuenta con
 * la misma condicion que filtra la lista (SPEC 2.108).
 */
export async function resumenDespachos(sedeId: string) {
  const base = porSede(sedeId);
  const contar = (condicion?: Prisma.DispatchGuideWhereInput) =>
    prisma.dispatchGuide.count({ where: { AND: condicion ? [...base, condicion] : base } });
  const [total, enTransito, conFaltantes, recibidas, anuladas, porRecibir, equiposEnTransito] = await Promise.all([
    contar(),
    contar(VISTAS_GUIA.en_transito()),
    contar(VISTAS_GUIA.recibida_parcial()),
    contar(VISTAS_GUIA.recibida()),
    contar(VISTAS_GUIA.anulada()),
    // "Por recibir": lo que va hacia la sede elegida; sin sede, no aplica.
    sedeId ? contar(VISTAS_GUIA.por_recibir(sedeId)) : Promise.resolve(null),
    // Equipos que viajan, de las guias que se ven.
    prisma.dispatchGuideItem.count({
      where: { estado: 'en_transito', guide: { AND: [...base, { estado: { not: 'anulada' } }] } },
    }),
  ]);
  return { total, enTransito, conFaltantes, recibidas, anuladas, porRecibir, equiposEnTransito };
}
