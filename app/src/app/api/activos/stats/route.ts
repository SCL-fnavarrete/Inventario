import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    // Obtener total de activos
    const total = await prisma.asset.count();

    // Obtener conteo por estado
    const byStatusRaw = await prisma.asset.groupBy({
      by: ["estado"],
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
          select: {
            assets: true,
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
    console.error("Error fetching asset stats:", error);
    return NextResponse.json(
      { error: "Error al obtener estadísticas" },
      { status: 500 }
    );
  }
}
