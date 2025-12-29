import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Schema para filtros de reportes de compras
const reportFiltersSchema = z.object({
  tipo: z.enum(["por-proveedor", "por-periodo", "resumen"]).default("resumen"),
  fechaDesde: z.string().optional(),
  fechaHasta: z.string().optional(),
  supplierId: z.string().uuid().optional(),
  moneda: z.enum(["CLP", "USD"]).optional(),
  groupBy: z.enum(["month", "year", "supplier"]).default("month"),
});

// GET /api/reportes/compras - Reportes de compras
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = reportFiltersSchema.safeParse({
      tipo: searchParams.get("tipo") || "resumen",
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      supplierId: searchParams.get("supplierId") || undefined,
      moneda: searchParams.get("moneda") || undefined,
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
      supplierId?: string;
      moneda?: "CLP" | "USD";
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

    if (filters.supplierId) {
      whereCondition.supplierId = filters.supplierId;
    }

    if (filters.moneda) {
      whereCondition.moneda = filters.moneda;
    }

    switch (filters.tipo) {
      case "por-proveedor":
        return await getReportePorProveedor(whereCondition);

      case "por-periodo":
        return await getReportePorPeriodo(whereCondition, filters.groupBy);

      case "resumen":
      default:
        return await getReporteResumen(whereCondition);
    }
  } catch (error) {
    console.error("Error generating purchases report:", error);
    return NextResponse.json(
      { error: "Error al generar reporte de compras" },
      { status: 500 }
    );
  }
}

// Reporte por proveedor
async function getReportePorProveedor(whereCondition: object) {
  const suppliers = await prisma.supplier.findMany({
    include: {
      purchases: {
        where: whereCondition,
        include: {
          _count: {
            select: { purchaseAssets: true },
          },
        },
      },
      _count: {
        select: { purchases: true },
      },
    },
    orderBy: { razonSocial: "asc" },
  });

  const reportData = suppliers.map((supplier) => {
    const totalCompras = supplier.purchases.length;
    const montoTotalCLP = supplier.purchases
      .filter((p) => p.moneda === "CLP")
      .reduce((sum, p) => sum + (p.montoTotal?.toNumber() || 0), 0);
    const montoTotalUSD = supplier.purchases
      .filter((p) => p.moneda === "USD")
      .reduce((sum, p) => sum + (p.montoTotal?.toNumber() || 0), 0);
    const totalActivos = supplier.purchases.reduce(
      (sum, p) => sum + p._count.purchaseAssets,
      0
    );

    return {
      supplier: {
        id: supplier.id,
        razonSocial: supplier.razonSocial,
        rutEmpresa: supplier.rutEmpresa,
        email: supplier.email,
      },
      estadisticas: {
        totalCompras,
        montoTotalCLP,
        montoTotalUSD,
        totalActivos,
        promedioCompraCLP: totalCompras > 0 ? montoTotalCLP / totalCompras : 0,
        promedioCompraUSD: totalCompras > 0 ? montoTotalUSD / totalCompras : 0,
      },
      ultimaCompra: supplier.purchases[0]?.fechaFactura || null,
    };
  });

  // Filtrar proveedores sin compras en el período
  const reportDataFiltered = reportData.filter(
    (r) => r.estadisticas.totalCompras > 0
  );

  // Totales generales
  const totales = {
    proveedores: reportDataFiltered.length,
    totalCompras: reportDataFiltered.reduce(
      (sum, r) => sum + r.estadisticas.totalCompras,
      0
    ),
    montoTotalCLP: reportDataFiltered.reduce(
      (sum, r) => sum + r.estadisticas.montoTotalCLP,
      0
    ),
    montoTotalUSD: reportDataFiltered.reduce(
      (sum, r) => sum + r.estadisticas.montoTotalUSD,
      0
    ),
    totalActivos: reportDataFiltered.reduce(
      (sum, r) => sum + r.estadisticas.totalActivos,
      0
    ),
  };

  return NextResponse.json({
    tipo: "por-proveedor",
    data: reportDataFiltered,
    totales,
    generadoEn: new Date().toISOString(),
  });
}

// Reporte por período
async function getReportePorPeriodo(
  whereCondition: object,
  groupBy: "month" | "year" | "supplier"
) {
  const purchases = await prisma.purchase.findMany({
    where: whereCondition,
    include: {
      supplier: {
        select: {
          id: true,
          razonSocial: true,
        },
      },
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
      montoTotalCLP: number;
      montoTotalUSD: number;
      totalActivos: number;
      proveedores: Set<string>;
    }
  > = {};

  purchases.forEach((purchase) => {
    let key: string;
    const date = new Date(purchase.fechaFactura);

    if (groupBy === "month") {
      key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    } else if (groupBy === "year") {
      key = `${date.getFullYear()}`;
    } else {
      key = purchase.supplier.razonSocial;
    }

    if (!groupedData[key]) {
      groupedData[key] = {
        periodo: key,
        totalCompras: 0,
        montoTotalCLP: 0,
        montoTotalUSD: 0,
        totalActivos: 0,
        proveedores: new Set(),
      };
    }

    groupedData[key].totalCompras++;
    if (purchase.moneda === "CLP") {
      groupedData[key].montoTotalCLP += purchase.montoTotal?.toNumber() || 0;
    } else {
      groupedData[key].montoTotalUSD += purchase.montoTotal?.toNumber() || 0;
    }
    groupedData[key].totalActivos += purchase._count.purchaseAssets;
    groupedData[key].proveedores.add(purchase.supplier.id);
  });

  // Convertir a array y ordenar
  const reportData = Object.values(groupedData)
    .map((item) => ({
      periodo: item.periodo,
      estadisticas: {
        totalCompras: item.totalCompras,
        montoTotalCLP: item.montoTotalCLP,
        montoTotalUSD: item.montoTotalUSD,
        totalActivos: item.totalActivos,
        proveedoresUnicos: item.proveedores.size,
      },
    }))
    .sort((a, b) => a.periodo.localeCompare(b.periodo));

  // Totales generales
  const totales = {
    periodos: reportData.length,
    totalCompras: reportData.reduce((sum, r) => sum + r.estadisticas.totalCompras, 0),
    montoTotalCLP: reportData.reduce((sum, r) => sum + r.estadisticas.montoTotalCLP, 0),
    montoTotalUSD: reportData.reduce((sum, r) => sum + r.estadisticas.montoTotalUSD, 0),
    totalActivos: reportData.reduce((sum, r) => sum + r.estadisticas.totalActivos, 0),
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
  const [
    totalCompras,
    totalProveedores,
    comprasStats,
    activosVinculados,
    comprasPorMoneda,
    top5Proveedores,
    ultimasCompras,
  ] = await Promise.all([
    // Total de compras
    prisma.purchase.count({ where: whereCondition }),

    // Total de proveedores con compras
    prisma.purchase.groupBy({
      by: ["supplierId"],
      where: whereCondition,
      _count: true,
    }),

    // Estadísticas de montos
    prisma.purchase.aggregate({
      where: whereCondition,
      _sum: { montoTotal: true },
      _avg: { montoTotal: true },
      _min: { montoTotal: true },
      _max: { montoTotal: true },
    }),

    // Total activos vinculados
    prisma.purchaseAsset.count({
      where: {
        purchase: whereCondition,
      },
    }),

    // Compras por moneda
    prisma.purchase.groupBy({
      by: ["moneda"],
      where: whereCondition,
      _count: true,
      _sum: { montoTotal: true },
    }),

    // Top 5 proveedores por monto
    prisma.supplier.findMany({
      where: {
        purchases: {
          some: whereCondition,
        },
      },
      include: {
        purchases: {
          where: whereCondition,
          select: {
            montoTotal: true,
            moneda: true,
          },
        },
      },
      take: 5,
    }),

    // Últimas 5 compras
    prisma.purchase.findMany({
      where: whereCondition,
      include: {
        supplier: {
          select: {
            razonSocial: true,
          },
        },
        _count: {
          select: { purchaseAssets: true },
        },
      },
      orderBy: { fechaFactura: "desc" },
      take: 5,
    }),
  ]);

  // Procesar top 5 proveedores
  const top5ProveedoresData = top5Proveedores
    .map((supplier) => ({
      id: supplier.id,
      razonSocial: supplier.razonSocial,
      totalCompras: supplier.purchases.length,
      montoTotalCLP: supplier.purchases
        .filter((p) => p.moneda === "CLP")
        .reduce((sum, p) => sum + (p.montoTotal?.toNumber() || 0), 0),
      montoTotalUSD: supplier.purchases
        .filter((p) => p.moneda === "USD")
        .reduce((sum, p) => sum + (p.montoTotal?.toNumber() || 0), 0),
    }))
    .sort((a, b) => b.montoTotalCLP - a.montoTotalCLP)
    .slice(0, 5);

  return NextResponse.json({
    tipo: "resumen",
    resumen: {
      totalCompras,
      proveedoresActivos: totalProveedores.length,
      activosVinculados,
      montoTotal: comprasStats._sum.montoTotal || 0,
      montoPromedio: comprasStats._avg.montoTotal || 0,
      montoMinimo: comprasStats._min.montoTotal || 0,
      montoMaximo: comprasStats._max.montoTotal || 0,
    },
    comprasPorMoneda: comprasPorMoneda.map((c) => ({
      moneda: c.moneda,
      cantidad: c._count,
      montoTotal: c._sum.montoTotal || 0,
    })),
    top5Proveedores: top5ProveedoresData,
    ultimasCompras: ultimasCompras.map((c) => ({
      id: c.id,
      numeroFactura: c.numeroFactura,
      fechaFactura: c.fechaFactura,
      proveedor: c.supplier.razonSocial,
      montoTotal: c.montoTotal,
      moneda: c.moneda,
      cantidadActivos: c._count.purchaseAssets,
    })),
    generadoEn: new Date().toISOString(),
  });
}
