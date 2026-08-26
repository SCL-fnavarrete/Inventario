import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

export async function GET() {
  try {
    await requirePermission('activos', 'read');

    // Obtener total de activos
    const total = await prisma.asset.count({ where: ACTIVOS_VIGENTES });

    // Obtener conteo por estado
    const byStatusRaw = await prisma.asset.groupBy({
      by: ["estado"],
      where: ACTIVOS_VIGENTES,
      _count: {
        estado: true,
      },
    });

    const byStatus: Record<string, number> = {
      disponible: 0,
      asignado: 0,
      en_mantencion: 0,
      reutilizable: 0,
      baja: 0,
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
          // El conteo excluye los registros descartados (SPEC 2.7.7).
          select: {
            assets: { where: ACTIVOS_VIGENTES },
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
      _count: {
        condicion: true,
      },
    });

    const byCondition: Record<string, number> = {
      nuevo: 0,
      bueno: 0,
      regular: 0,
      malo: 0,
    };

    byConditionRaw.forEach((item) => {
      if (item.condicion) {
        byCondition[item.condicion] = item._count.condicion;
      }
    });

    return NextResponse.json({
      total,
      byStatus,
      byCategory,
      byCondition,
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener estadísticas');
  }
}
