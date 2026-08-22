import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// Mapeo de estados para mostrar en español
const ESTADO_LABELS: Record<string, string> = {
  disponible: "Disponible",
  asignado: "Asignado",
  en_mantencion: "En Mantención",
  reutilizable: "Reutilizable",
  baja: "Baja",
  vendido: "Vendido",
};

const CONDICION_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  usado: "Usado",
  danado: "Dañado",
};

export async function GET(request: NextRequest) {
  try {
    await requirePermission('activos', 'read');

    const searchParams = request.nextUrl.searchParams;
    const estado = searchParams.get("estado") || "";
    const categoriaId = searchParams.get("categoriaId") || "";

    // Construir filtros
    const where: Record<string, unknown> = {};
    if (estado) {
      where.estado = estado;
    }
    if (categoriaId) {
      where.categoriaId = categoriaId;
    }

    // Obtener activos con sus relaciones
    const assets = await prisma.asset.findMany({
      where,
      include: {
        categoria: {
          select: { nombre: true },
        },
        empleadoActual: {
          select: { nombres: true, apellidoPaterno: true, rut: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Transformar datos para Excel
    const excelData = assets.map((asset) => ({
      "Código Interno": asset.numeroActivoInterno || "",
      "N° Serie": asset.numeroSerie || "",
      Categoría: asset.categoria.nombre,
      Marca: asset.marca,
      Modelo: asset.modelo,
      Estado: ESTADO_LABELS[asset.estado] || asset.estado,
      Condición: CONDICION_LABELS[asset.condicion] || asset.condicion,
      "Asignado a": asset.empleadoActual
        ? `${asset.empleadoActual.nombres} ${asset.empleadoActual.apellidoPaterno}`
        : "",
      "RUT Asignado": asset.empleadoActual?.rut || "",
      Procesador: asset.procesador || "",
      RAM: asset.ram || "",
      "Disco Duro": asset.discoDuro || "",
      "Sistema Operativo": asset.sistemaOperativo || "",
      Pulgadas: asset.pulgadas ? Number(asset.pulgadas) : "",
      IMEI: asset.imei || "",
      "N° Teléfono": asset.numeroTelefono || "",
      "Ubicación Física": asset.ubicacionFisica || "",
      "Microsoft 365": asset.microsoft365 ? "Sí" : "No",
      "Intune Enrolled": asset.intuneEnrolled ? "Sí" : "No",
      "Fecha Compra": asset.fechaCompra
        ? new Date(asset.fechaCompra).toLocaleDateString("es-CL")
        : "",
      "Fin Garantía": asset.fechaGarantiaFin
        ? new Date(asset.fechaGarantiaFin).toLocaleDateString("es-CL")
        : "",
      Observaciones: asset.observaciones || "",
    }));

    // Crear workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Ajustar ancho de columnas
    const colWidths = [
      { wch: 15 }, // Código Interno
      { wch: 20 }, // N° Serie
      { wch: 12 }, // Categoría
      { wch: 12 }, // Marca
      { wch: 20 }, // Modelo
      { wch: 12 }, // Estado
      { wch: 10 }, // Condición
      { wch: 25 }, // Asignado a
      { wch: 15 }, // RUT Asignado
      { wch: 25 }, // Procesador
      { wch: 8 },  // RAM
      { wch: 12 }, // Disco Duro
      { wch: 15 }, // Sistema Operativo
      { wch: 8 },  // Pulgadas
      { wch: 18 }, // IMEI
      { wch: 15 }, // N° Teléfono
      { wch: 15 }, // Ubicación Física
      { wch: 12 }, // Microsoft 365
      { wch: 12 }, // Intune Enrolled
      { wch: 12 }, // Fecha Compra
      { wch: 12 }, // Fin Garantía
      { wch: 30 }, // Observaciones
    ];
    worksheet["!cols"] = colWidths;

    // Agregar worksheet al workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Activos");

    // Generar buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

    // Crear nombre de archivo con fecha
    const fecha = new Date().toISOString().split("T")[0];
    const filename = `inventario_activos_${fecha}.xlsx`;

    // Retornar archivo
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al exportar activos');
  }
}
