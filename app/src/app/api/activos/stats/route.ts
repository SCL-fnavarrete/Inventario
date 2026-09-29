import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { leerFiltrosActivos, whereFiltrosActivos } from '@/lib/queries/activos';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('activos', 'read');

    // Las tarjetas cuentan con los mismos filtros que la lista (sede,
    // categoria, busqueda y datos de catalogo; SPEC 2.116.6), salvo el suyo:
    // las de estado ignoran el estado elegido y las pestañas de categoria la
    // categoria elegida. Si no, al elegir "Disponible" las demas quedarian en 0.
    const { estado: _estado, porLlegar: _porLlegar, ...filtros } = leerFiltrosActivos(request.nextUrl.searchParams);
    const whereVigentes = whereFiltrosActivos(filtros);
    const whereSinCategoria = whereFiltrosActivos({ ...filtros, categoriaId: "" });

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
            assets: { where: whereSinCategoria },
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

    // Equipos que vienen en camino a la sede elegida en el menu (tarjeta
    // "Por llegar", SPEC 2.108). null con "Todas las sedes".
    const porLlegar = filtros.sedeIdFiltro
      ? await prisma.asset.count({ where: whereFiltrosActivos({ ...filtros, porLlegar: true }) })
      : null;

    return NextResponse.json({
      total,
      porLlegar,
      // "Por repartir" (SPEC 2.111.6): igual que su tarjeta de estado.
      porRepartir: byStatus.por_repartir,
      byStatus,
      byCategory,
      byCondition,
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener estadísticas');
  }
}
