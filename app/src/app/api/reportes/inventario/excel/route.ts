import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { etiquetaConectividad } from '@/lib/utils/assetSpecs';
import { sedeWhere } from '@/lib/auth/sedeScope';
import { formatearFecha } from "@/lib/utils/fechas";

export async function GET() {
  try {
    const session = await requirePermission('reportes', 'read');

    // Este reporte no filtraba por sede: un tecnico podia descargar el
    // inventario completo de la empresa (2.24.1).
    const activos = await prisma.asset.findMany({
      where: sedeWhere(session),
      include: {
        categoria: true,
        assignments: {
          where: { ...ACTIVOS_VIGENTES, activo: true },
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
      // Pulgadas (Monitor), Plan (Celular) y Conectividad
      // (Mouse/Teclado/Webcam/Aud\u00edfonos) se agregan aqu\u00ed (14-sep-2026,
      // SPEC 2.19) porque antes el Excel solo mostraba campos de Notebook y
      // Celular b\u00e1sico, dejando estas categor\u00edas sin sus specs propias.
      // (El campo Operador que hubo aqu\u00ed se quit\u00f3 el mismo d\u00eda, SPEC 2.20:
      // se elimin\u00f3 de Celular por completo.)
      Pulgadas: a.pulgadas ? `${a.pulgadas}"` : "",
      "N\u00b0 Tel\u00e9fono": a.numeroTelefono || "",
      Plan: a.tipoPlan || "",
      Conectividad: a.conectividad ? etiquetaConectividad(a.conectividad) : "",
      Estado: a.estado,
      Condici\u00f3n: a.condicion,
      "Ubicaci\u00f3n F\u00edsica": a.ubicacionFisica || "",
      "Asignado a": a.assignments[0]?.employee
        ? `${a.assignments[0].employee.nombres} ${a.assignments[0].employee.apellidoPaterno}`
        : "",
      "RUT Asignado": a.assignments[0]?.employee?.rut || "",
      "Fecha Compra": a.fechaCompra
        ? formatearFecha(a.fechaCompra)
        : "",
      "Fin Garant\u00eda": a.fechaGarantiaFin
        ? formatearFecha(a.fechaGarantiaFin)
        : "",
      "Microsoft 365": a.microsoft365 ? "S\u00ed" : "No",
      // Nombre del plan (ej. "Premium") -- se agrega el mismo d\u00eda que el
      // campo (14-sep-2026, SPEC 2.23): antes no exist\u00eda ning\u00fan lugar
      // donde se guardara, se perd\u00eda al importar.
      "Licencia Microsoft 365": a.tipoLicenciaMicrosoft365 || "",
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
    return handleApiError(error, 'Error al generar reporte');
  }
}
