import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { VISTAS_GUIA, sedePropiaGuias, whereGuiaVisible } from '@/lib/queries/guias';

// GET /api/guias-despacho/resumen - Numeros de las tarjetas de Guías (SPEC
// 2.108). Cada tarjeta cuenta con la misma condicion que filtra la lista.
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('guias', 'read');
    const sedeIdFiltro = request.nextUrl.searchParams.get("sedeId") || "";

    // Visibilidad y, para quien ve todas, la sede del menu (por ambas puntas).
    const base: Prisma.DispatchGuideWhereInput[] = [whereGuiaVisible(session)];
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      base.push({ OR: [{ sedeId: sedeIdFiltro }, { sedeDestinoId: sedeIdFiltro }] });
    }
    const contar = (condicion?: Prisma.DispatchGuideWhereInput) =>
      prisma.dispatchGuide.count({ where: { AND: condicion ? [...base, condicion] : base } });

    const sedePropia = sedePropiaGuias(session, sedeIdFiltro);
    const [total, enTransito, conFaltantes, recibidas, anuladas, porRecibir, equiposEnTransito] =
      await Promise.all([
        contar(),
        contar(VISTAS_GUIA.en_transito()),
        contar(VISTAS_GUIA.recibida_parcial()),
        contar(VISTAS_GUIA.recibida()),
        contar(VISTAS_GUIA.anulada()),
        sedePropia ? contar(VISTAS_GUIA.por_recibir(sedePropia)) : Promise.resolve(null),
        // Equipos que viajan, de las guias que se ven.
        prisma.dispatchGuideItem.count({
          where: { estado: 'en_transito', guide: { AND: [...base, { estado: { not: 'anulada' } }] } },
        }),
      ]);

    return NextResponse.json({
      total,
      enTransito,
      conFaltantes,
      recibidas,
      anuladas,
      porRecibir,
      equiposEnTransito,
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener el resumen de despachos');
  }
}
