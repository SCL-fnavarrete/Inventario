import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

export async function GET() {
  try {
    await requirePermission('reportes', 'read');

    const cincoAnosAtras = new Date();
    cincoAnosAtras.setFullYear(cincoAnosAtras.getFullYear() - 5);

    const activos = await prisma.asset.findMany({
      where: {
        ...ACTIVOS_VIGENTES,
        estado: { not: "baja" },
        OR: [
          { sistemaOperativo: { contains: "Windows 10", mode: "insensitive" } },
          { fechaCompra: { lt: cincoAnosAtras } },
        ],
      },
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
      orderBy: { fechaCompra: "asc" },
    });

    const data = activos.map((a) => {
      const antiguedad = a.fechaCompra
        ? Math.floor(
            (Date.now() - new Date(a.fechaCompra).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          )
        : null;

      const esWindows10 = a.sistemaOperativo
        ?.toLowerCase()
        .includes("windows 10");
      const esAntiguo = antiguedad !== null && antiguedad >= 5;

      const motivos = [];
      if (esWindows10) motivos.push("Windows 10");
      if (esAntiguo) motivos.push("M\u00e1s de 5 a\u00f1os");

      return {
        Categor\u00eda: a.categoria?.nombre || "",
        "N\u00b0 Serie": a.numeroSerie || "",
        Marca: a.marca,
        Modelo: a.modelo,
        "Sistema Operativo": a.sistemaOperativo || "",
        "Fecha Compra": a.fechaCompra
          ? new Date(a.fechaCompra).toLocaleDateString("es-CL")
          : "",
        "Antig\u00fcedad (a\u00f1os)": antiguedad !== null ? antiguedad : "",
        Estado: a.estado,
        Condici\u00f3n: a.condicion,
        "Asignado a": a.assignments[0]?.employee
          ? `${a.assignments[0].employee.nombres} ${a.assignments[0].employee.apellidoPaterno}`
          : "",
        "RUT Asignado": a.assignments[0]?.employee?.rut || "",
        "Motivo Obsolescencia": motivos.join(", "),
        "Ubicaci\u00f3n": a.ubicacionFisica || "",
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Equipos Obsoletos");

    // Segunda hoja: Resumen
    const resumen = [
      { Concepto: "Total Equipos Obsoletos", Cantidad: activos.length },
      {
        Concepto: "Con Windows 10",
        Cantidad: activos.filter((a) =>
          a.sistemaOperativo?.toLowerCase().includes("windows 10")
        ).length,
      },
      {
        Concepto: "M\u00e1s de 5 a\u00f1os",
        Cantidad: activos.filter((a) => {
          if (!a.fechaCompra) return false;
          const antiguedad = Math.floor(
            (Date.now() - new Date(a.fechaCompra).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000)
          );
          return antiguedad >= 5;
        }).length,
      },
      {
        Concepto: "Actualmente Asignados",
        Cantidad: activos.filter((a) => a.estado === "asignado").length,
      },
      {
        Concepto: "Disponibles",
        Cantidad: activos.filter((a) => a.estado === "disponible").length,
      },
    ];

    const ws2 = XLSX.utils.json_to_sheet(resumen);
    XLSX.utils.book_append_sheet(wb, ws2, "Resumen");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="equipos_obsoletos_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar reporte');
  }
}
