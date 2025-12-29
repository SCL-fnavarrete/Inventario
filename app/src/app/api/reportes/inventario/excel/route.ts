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

    const activos = await prisma.asset.findMany({
      include: {
        categoria: true,
        assignments: {
          where: { activo: true },
          include: {
            employee: {
              select: {
                rut: true,
                nombres: true,
                apellidoPaterno: true,
              },
            },
          },
          take: 1,
        },
      },
      orderBy: [{ categoria: { nombre: "asc" } }, { marca: "asc" }],
    });

    const data = activos.map((a) => ({
      Categoria: a.categoria?.nombre || "",
      "N\u00b0 Serie": a.numeroSerie || "",
      IMEI: a.imei || "",
      Marca: a.marca,
      Modelo: a.modelo,
      Procesador: a.procesador || "",
      RAM: a.ram || "",
      "Disco Duro": a.discoDuro || "",
      "Sistema Operativo": a.sistemaOperativo || "",
      "N\u00b0 Tel\u00e9fono": a.numeroTelefono || "",
      Estado: a.estado,
      Condici\u00f3n: a.condicion,
      "Ubicaci\u00f3n F\u00edsica": a.ubicacionFisica || "",
      "Asignado a": a.assignments[0]?.employee
        ? `${a.assignments[0].employee.nombres} ${a.assignments[0].employee.apellidoPaterno}`
        : "",
      "RUT Asignado": a.assignments[0]?.employee?.rut || "",
      "Fecha Compra": a.fechaCompra
        ? new Date(a.fechaCompra).toLocaleDateString("es-CL")
        : "",
      "Fin Garant\u00eda": a.fechaGarantiaFin
        ? new Date(a.fechaGarantiaFin).toLocaleDateString("es-CL")
        : "",
      "Microsoft 365": a.microsoft365 ? "S\u00ed" : "No",
      Observaciones: a.observaciones || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");

    // Ajustar ancho de columnas
    const colWidths = Object.keys(data[0] || {}).map((key) => ({
      wch: Math.max(key.length, 15),
    }));
    ws["!cols"] = colWidths;

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="inventario_${new Date().toISOString().split("T")[0]}.xlsx"`,
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
