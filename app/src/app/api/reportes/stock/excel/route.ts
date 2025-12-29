import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const categorias = await prisma.assetCategory.findMany({
      include: {
        assets: {
          select: {
            estado: true,
            ubicacionFisica: true,
          },
        },
      },
      orderBy: { nombre: "asc" },
    });

    const stockData = categorias.map((cat) => ({
      Categor\u00eda: cat.nombre,
      Total: cat.assets.length,
      Disponibles: cat.assets.filter((a) => a.estado === "disponible").length,
      Asignados: cat.assets.filter((a) => a.estado === "asignado").length,
      "En Mantenci\u00f3n": cat.assets.filter((a) => a.estado === "en_mantencion")
        .length,
      Reutilizables: cat.assets.filter((a) => a.estado === "reutilizable").length,
      Baja: cat.assets.filter((a) => a.estado === "baja").length,
      Vendidos: cat.assets.filter((a) => a.estado === "vendido").length,
    }));

    // Agregar fila de totales
    stockData.push({
      Categor\u00eda: "TOTALES",
      Total: stockData.reduce((sum, r) => sum + r.Total, 0),
      Disponibles: stockData.reduce((sum, r) => sum + r.Disponibles, 0),
      Asignados: stockData.reduce((sum, r) => sum + r.Asignados, 0),
      "En Mantenci\u00f3n": stockData.reduce((sum, r) => sum + r["En Mantenci\u00f3n"], 0),
      Reutilizables: stockData.reduce((sum, r) => sum + r.Reutilizables, 0),
      Baja: stockData.reduce((sum, r) => sum + r.Baja, 0),
      Vendidos: stockData.reduce((sum, r) => sum + r.Vendidos, 0),
    });

    const ws = XLSX.utils.json_to_sheet(stockData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Stock");

    // Segunda hoja: detalle por ubicaci\u00f3n
    const ubicacionData: { Categor\u00eda: string; Ubicaci\u00f3n: string; Cantidad: number }[] =
      [];
    categorias.forEach((cat) => {
      const ubicaciones: Record<string, number> = {};
      cat.assets.forEach((a) => {
        const ub = a.ubicacionFisica || "Sin ubicaci\u00f3n";
        ubicaciones[ub] = (ubicaciones[ub] || 0) + 1;
      });
      Object.entries(ubicaciones).forEach(([ubicacion, cantidad]) => {
        ubicacionData.push({
          Categor\u00eda: cat.nombre,
          Ubicaci\u00f3n: ubicacion,
          Cantidad: cantidad,
        });
      });
    });

    const ws2 = XLSX.utils.json_to_sheet(ubicacionData);
    XLSX.utils.book_append_sheet(wb, ws2, "Por Ubicaci\u00f3n");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Error generando Excel:", error);
    return NextResponse.json(
      { error: "Error al generar reporte" },
      { status: 500 }
    );
  }
}
