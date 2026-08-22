import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

export async function GET() {
  try {
    await requirePermission('reportes', 'read');

    const desvinculaciones = await prisma.termination.findMany({
      include: {
        employee: {
          select: {
            rut: true,
            nombres: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            cargo: true,
            ubicacion: true,
            jefatura: true,
          },
        },
      },
      orderBy: { fechaDesvinculacion: "desc" },
    });

    const data = desvinculaciones.map((d) => ({
      RUT: d.employee.rut,
      Nombre: `${d.employee.nombres} ${d.employee.apellidoPaterno} ${d.employee.apellidoMaterno || ""}`.trim(),
      Cargo: d.employee.cargo || "",
      Ubicaci\u00f3n: d.employee.ubicacion || "",
      Jefatura: d.employee.jefatura || "",
      "Fecha Desvinculaci\u00f3n": new Date(d.fechaDesvinculacion).toLocaleDateString(
        "es-CL"
      ),
      "Fecha Devoluci\u00f3n": d.fechaDevolucionEquipos
        ? new Date(d.fechaDevolucionEquipos).toLocaleDateString("es-CL")
        : "Pendiente",
      "Estado Notebook": d.estadoNotebook,
      "Estado Celular": d.estadoCelular,
      "Estado Monitor": d.estadoMonitor,
      "Estado Kit": d.estadoKit,
      "Recibido Por": d.recibidoPor || "",
      "Lugar Devoluci\u00f3n": d.lugarDevolucion || "",
      "Requiere Descuento": d.requiereDescuento ? "S\u00ed" : "No",
      "Monto Descuento": d.montoDescuento?.toString() || "0",
      "Motivo Descuento": d.motivoDescuento || "",
      "Notificado RRHH": d.notificadoRrhh ? "S\u00ed" : "No",
      "Fecha Notificaci\u00f3n": d.fechaNotificacionRrhh
        ? new Date(d.fechaNotificacionRrhh).toLocaleDateString("es-CL")
        : "",
      Observaciones: d.observaciones || "",
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Desvinculaciones RRHH");

    // Segunda hoja: Resumen de descuentos
    const descuentos = desvinculaciones
      .filter((d) => d.requiereDescuento)
      .map((d) => ({
        RUT: d.employee.rut,
        Nombre: `${d.employee.nombres} ${d.employee.apellidoPaterno}`,
        Monto: d.montoDescuento?.toString() || "0",
        Motivo: d.motivoDescuento || "",
        "Fecha Desvinculaci\u00f3n": new Date(d.fechaDesvinculacion).toLocaleDateString(
          "es-CL"
        ),
      }));

    if (descuentos.length > 0) {
      const ws2 = XLSX.utils.json_to_sheet(descuentos);
      XLSX.utils.book_append_sheet(wb, ws2, "Descuentos");
    }

    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="reporte_rrhh_${new Date().toISOString().split("T")[0]}.xlsx"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar reporte');
  }
}
