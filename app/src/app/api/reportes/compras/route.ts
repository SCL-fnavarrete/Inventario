import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// Reporte de compras. Simplificado el 11-sep-2026 (pedido explicito de
// Javier): compras ya no tiene proveedor ni datos financieros (ver SPEC
// 2.10), asi que este reporte se redujo a conteos por periodo. No hay
// ninguna pantalla que hoy consuma este endpoint -- se dejo compilando y
// coherente con el modelo actual por si se necesita a futuro.
const reportFiltersSchema = z.object({
  tipo: z.enum(["por-periodo", "resumen"]).default("resumen"),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  groupBy: z.enum(["month", "year"]).default("month"),
});

// GET /api/reportes/compras - Reportes de compras
export async function GET(request: NextRequest) {
  try {
    await requirePermission('reportes', 'read');

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = reportFiltersSchema.safeParse({
      tipo: searchParams.get("tipo") || "resumen",
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      groupBy: searchParams.get("groupBy") || "month",
    });

    if (!filtersResult.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: filtersResult.error.issues },
        { status: 400 }
      );
    }

    const filters = filtersResult.data;

    // Construir condiciones base
    const whereCondition: {
      fechaFactura?: { gte?: Date; lte?: Date };
    } = {};

    if (filters.fechaDesde || filters.fechaHasta) {
      whereCondition.fechaFactura = {};
      if (filters.fechaDesde) {
        whereCondition.fechaFactura.gte = new Date(filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        whereCondition.fechaFactura.lte = new Date(filters.fechaHasta);
      }
    }

    switch (filters.tipo) {
      case "por-periodo":
        return await getReportePorPeriodo(whereCondition, filters.groupBy);

      case "resumen":
      default:
        return await getReporteResumen(whereCondition);
    }
  } catch (error) {
    return handleApiError(error, 'Error al generar reporte de compras');
  }
}

// Reporte por período
async function getReportePorPeriodo(
  whereCondition: object,
  groupBy: "month" | "year"
) {
  const purchases = await prisma.purchase.findMany({
    where: whereCondition,
    include: {
      _count: {
        select: { purchaseAssets: true },
      },
    },
    orderBy: { fechaFactura: "asc" },
  });

  // Agrupar por período
  const groupedData: Record<
    string,
    {
      periodo: string;
      totalCompras: number;
      totalActivos: number;
    }
  > = {};

  purchases.forEach((purchase) => {
    const date = new Date(purchase.fechaFactura);
    const key =
      groupBy === "month"
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`
        : `${date.getFullYear()}`;

    if (!groupedData[key]) {
      groupedData[key] = {
        periodo: key,
        totalCompras: 0,
        totalActivos: 0,
      };
    }

    groupedData[key].totalCompras++;
    groupedData[key].totalActivos += purchase._count.purchaseAssets;
  });

  // Convertir a array y ordenar
  const reportData = Object.values(groupedData).sort((a, b) =>
    a.periodo.localeCompare(b.periodo)
  );

  // Totales generales
  const totales = {
    periodos: reportData.length,
    totalCompras: reportData.reduce((sum, r) => sum + r.totalCompras, 0),
    totalActivos: reportData.reduce((sum, r) => sum + r.totalActivos, 0),
  };

  return NextResponse.json({
    tipo: "por-periodo",
    groupBy,
    data: reportData,
    totales,
    generadoEn: new Date().toISOString(),
  });
}

// Reporte resumen general
async function getReporteResumen(whereCondition: object) {
  const [totalCompras, activosVinculados, ultimasCompras] = await Promise.all([
    // Total de compras
    prisma.purchase.count({ where: whereCondition }),

    // Total activos vinculados
    prisma.purchaseAsset.count({
      where: {
        purchase: whereCondition,
      },
    }),

    // Últimas 5 compras
    prisma.purchase.findMany({
      where: whereCondition,
      include: {
        _count: {
          select: { purchaseAssets: true },
        },
      },
      orderBy: { fechaFactura: "desc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({
    tipo: "resumen",
    resumen: {
      totalCompras,
      activosVinculados,
    },
    ultimasCompras: ultimasCompras.map((c) => ({
      id: c.id,
      numeroFactura: c.numeroFactura,
      fechaFactura: c.fechaFactura,
      cantidadActivos: c._count.purchaseAssets,
    })),
    generadoEn: new Date().toISOString(),
  });
}
