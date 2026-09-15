import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { formatearFecha } from "@/lib/utils/fechas";

export async function GET() {
  try {
    await requirePermission('reportes', 'read');

    const empleados = await prisma.employee.findMany({
      where: { estado: "activo" },
      include: {
        assignments: {
          where: { activo: true },
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
        },
      },
      orderBy: [{ apellidoPaterno: "asc" }, { nombres: "asc" }],
    });

    const data = empleados.map((emp) => {
      const notebook = emp.assignments.find(
        (a) => a.asset.categoria?.nombre === "Notebook"
      );
      const celular = emp.assignments.find(
        (a) => a.asset.categoria?.nombre === "Celular"
      );
      const monitor = emp.assignments.find(
        (a) => a.asset.categoria?.nombre === "Monitor"
      );

      return {
        RUT: emp.rut,
        Nombre: emp.nombres,
        "Apellido Paterno": emp.apellidoPaterno,
        "Apellido Materno": emp.apellidoMaterno || "",
        Cargo: emp.cargo || "",
        Jefatura: emp.jefatura || "",
        Ubicaci\u00f3n: emp.ubicacion || "",
        "Tipo Contrato": emp.tipoContrato,
        "Notebook Marca": notebook?.asset.marca || "",
        "Notebook Modelo": notebook?.asset.modelo || "",
        "Notebook Serie": notebook?.asset.numeroSerie || "",
        "Notebook Fecha": notebook
          ? formatearFecha(notebook.fechaEntrega)
          : "",
        "Celular Marca": celular?.asset.marca || "",
        "Celular Modelo": celular?.asset.modelo || "",
        "Celular Tel\u00e9fono": celular?.asset.numeroTelefono || "",
        "Celular Fecha": celular
          ? formatearFecha(celular.fechaEntrega)
          : "",
        "Monitor Marca": monitor?.asset.marca || "",
        "Monitor Modelo": monitor?.asset.modelo || "",
        "Monitor Serie": monitor?.asset.numeroSerie || "",
        "Monitor Fecha": monitor
          ? formatearFecha(monitor.fechaEntrega)
          : "",
        "Total Equipos": emp.assignments.length,
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Empleados con Activos");

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="empleados_activos_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar reporte');
  }
}
