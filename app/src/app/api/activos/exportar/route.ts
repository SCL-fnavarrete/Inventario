import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { sedeWhere, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { formatearFecha } from "@/lib/utils/fechas";

// Mapeo de estados para mostrar en español
const ESTADO_LABELS: Record<string, string> = {
  disponible: "Disponible",
  asignado: "Asignado",
  en_mantencion: "En Mantención",
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
    const session = await requirePermission('activos', 'read');

    const searchParams = request.nextUrl.searchParams;
    const estado = searchParams.get("estado") || "";
    const categoriaId = searchParams.get("categoriaId") || "";

    // Construir filtros
    // Los registros descartados no se exportan (SPEC 2.7.7). Ademas, un
    // tecnico solo exporta su propia sede (2.24.1) -- antes este endpoint no
    // filtraba por sede y un tecnico podia descargar el inventario completo
    // de la empresa.
    const where: Record<string, unknown> = { ...ACTIVOS_VIGENTES, ...sedeWhere(session) };
    if (estado) {
      where.estado = estado;
    }
    if (categoriaId) {
      where.categoriaId = categoriaId;
    }

    // Filtro de sede del selector global del nav (15-sep-2026, QA
    // funcional, SPEC 2.38). Antes el boton "Exportar" armaba el link sin
    // `sedeId`, asi que con una sede elegida en el nav la pantalla mostraba
    // una sede y el Excel descargado traia todas. Mismo criterio que
    // /api/activos: solo aplica para quien tiene visibilidad total.
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      where.sedeId = sedeIdFiltro;
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
      // SPEC 2.23 (14-sep-2026): nombre del plan (ej. "Premium").
      "Licencia Microsoft 365": asset.tipoLicenciaMicrosoft365 || "",
      "Intune Enrolled": asset.intuneEnrolled ? "Sí" : "No",
      "Fecha Compra": asset.fechaCompra
        ? formatearFecha(asset.fechaCompra)
        : "",
      "Fin Garantía": asset.fechaGarantiaFin
        ? formatearFecha(asset.fechaGarantiaFin)
        : "",
      Observaciones: asset.observaciones || "",
    }));

    // Crear workbook y worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(excelData);

    // Ajustar ancho de columnas
    const colWidths = [
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
      { wch: 20 }, // Licencia Microsoft 365
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
