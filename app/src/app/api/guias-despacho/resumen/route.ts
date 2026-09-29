import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/shared/prisma";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { VISTAS_GUIA } from '@/modules/despachos';

// GET /api/guias-despacho/resumen - Numeros de las tarjetas de Guías (SPEC
// 2.108). Cada tarjeta cuenta con la misma condicion que filtra la lista.
export async function GET(request: NextRequest) {
  try {
    await requirePermission('guias', 'read');
    const sedeIdFiltro = request.nextUrl.searchParams.get("sedeId") || "";

    // Todas las guias; la sede del menu filtra por ambas puntas (SPEC 2.117).
    const base: Prisma.DispatchGuideWhereInput[] = [];
    if (sedeIdFiltro) {
      base.push({ OR: [{ sedeId: sedeIdFiltro }, { sedeDestinoId: sedeIdFiltro }] });
    }
    const contar = (condicion?: Prisma.DispatchGuideWhereInput) =>
      prisma.dispatchGuide.count({ where: { AND: condicion ? [...base, condicion] : base } });

    const [total, enTransito, conFaltantes, recibidas, anuladas, porRecibir, equiposEnTransito] =
      await Promise.all([
        contar(),
        contar(VISTAS_GUIA.en_transito()),
        contar(VISTAS_GUIA.recibida_parcial()),
        contar(VISTAS_GUIA.recibida()),
        contar(VISTAS_GUIA.anulada()),
        // "Por recibir": lo que va hacia la sede elegida; sin sede, no aplica.
        sedeIdFiltro ? contar(VISTAS_GUIA.por_recibir(sedeIdFiltro)) : Promise.resolve(null),
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
