import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

export async function GET() {
  try {
    const session = await requirePermission('activos', 'read');

    // Aislamiento por sede (SPEC 2.9): las tarjetas/estadisticas deben
    // reflejar solo lo de la sede del tecnico, igual que el listado de
    // /api/activos. Antes este endpoint no filtraba nada -- por eso las
    // tarjetas mostraban el total de todas las sedes aunque el listado ya
    // estuviera bien filtrado.
    const sw = sedeWhere(session);
    const whereVigentes = { ...ACTIVOS_VIGENTES, ...sw };

    // Obtener total de activos
    const total = await prisma.asset.count({ where: whereVigentes });

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
      reutilizable: 0,
      baja: 0,
      vendido:0,
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
          // El conteo excluye los registros descartados (SPEC 2.7.7) y
          // aplica el aislamiento por sede.
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
      // Sin este where, el conteo por condicion incluia los registros
      // descartados, mientras total, byStatus y byCategory si los excluian:
      // el mismo endpoint respondia con dos universos distintos.
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
