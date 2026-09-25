import { NextRequest, NextResponse } from "next/server";
import { sedePropiaGuias, whereActivosPorLlegar } from '@/lib/queries/guias';
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'read');

    // Stats cards must reflect only the technician's sede, same as
    // the /api/activos listing.
    const sw = sedeWhere(session);
    const whereVigentes: Record<string, unknown> = { ...ACTIVOS_VIGENTES, ...sw };

    // Nav sede filter, same criterion as /api/activos: only honored for
    // users with full visibility; others are already scoped by sedeWhere()
    // and can't override it via query string.
    const sedeIdFiltro = request.nextUrl.searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      whereVigentes.sedeId = sedeIdFiltro;
    }

    // Obtener total de activos
    const total = await prisma.asset.count({ where: whereVigentes });

    // "Por repartir" (SPEC 2.111.6): de todas las sedes, tambien para el
    // tecnico; la sede del menu filtra para quien ve todas.
    const porRepartir = await prisma.asset.count({
      where: {
        ...ACTIVOS_VIGENTES,
        estado: "por_repartir",
        ...(sedeIdFiltro && tieneVisibilidadTotal(session) && { sedeId: sedeIdFiltro }),
      },
    });

    // Obtener conteo por estado
    const byStatusRaw = await prisma.asset.groupBy({
      by: ["estado"],
      where: whereVigentes,
      _count: {
        estado: true,
      },
    });

    const byStatus: Record<string, number> = {
      disponible: 0,
      asignado: 0,
      en_mantencion: 0,
      baja: 0,
      vendido: 0,
      no_devuelto: 0,
      en_transito: 0,
      por_repartir: 0,
    };

    byStatusRaw.forEach((item) => {
      if (item.estado) {
        byStatus[item.estado] = item._count.estado;
      }
    });

    // Obtener conteo por categoría con nombre
    const categorias = await prisma.assetCategory.findMany({
      select: {
        id: true,
        nombre: true,
        _count: {
          // Excludes discarded records and applies sede scoping.
          select: {
            assets: { where: whereVigentes },
          },
        },
      },
      orderBy: {
        assets: {
          _count: "desc",
        },
      },
    });

    const byCategory = categorias.map((cat) => ({
      id: cat.id,
      nombre: cat.nombre,
      count: cat._count.assets,
    }));

    // Obtener conteo por condición
    const byConditionRaw = await prisma.asset.groupBy({
      by: ["condicion"],
      // Applies the same exclusion as total/byStatus/byCategory so all
      // counts in the response are consistent.
      where: whereVigentes,
      _count: {
        condicion: true,
      },
    });

    const byCondition: Record<string, number> = {
      nuevo: 0,
      usado: 0,
      danado: 0,
    };

    byConditionRaw.forEach((item) => {
      if (item.condicion) {
        byCondition[item.condicion] = item._count.condicion;
      }
    });

    // Equipos que vienen en camino a la sede (tarjeta "Por llegar", SPEC
    // 2.108). null si no hay una sede propia (admin sin sede elegida).
    const sedePropia = sedePropiaGuias(session, sedeIdFiltro);
    const porLlegar = sedePropia
      ? await prisma.asset.count({ where: whereActivosPorLlegar(sedePropia) })
      : null;

    return NextResponse.json({
      total,
      porLlegar,
      porRepartir,
      byStatus,
      byCategory,
      byCondition,
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener estadísticas');
  }
}
