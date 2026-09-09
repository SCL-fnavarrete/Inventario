import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as fs from "fs";
import * as path from "path";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// Extender tipos de jsPDF para lastAutoTable
declare module "jspdf" {
  interface jsPDF {
    lastAutoTable?: {
      finalY: number;
    };
  }
}

interface RouteParams {
  params: Promise<{ id: string }>;
}

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(amount);
}

const estadoLabels: Record<string, string> = {
  ok: "OK",
  danado: "Dañado",
  no_aplica: "No Aplica",
  pendiente: "Pendiente",
};

const estadoColors: Record<string, [number, number, number]> = {
  ok: [0, 128, 0],
  danado: [255, 0, 0],
  no_aplica: [128, 128, 128],
  pendiente: [255, 165, 0],
};

// GET /api/desvinculaciones/[id]/reporte-rrhh - Generar reporte para RRHH
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('desvinculaciones', 'read');
    const { id } = await params;

    const termination = await prisma.termination.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            assignments: {
              include: {
                asset: {
                  include: { categoria: true },
                },
              },
              orderBy: { fechaEntrega: "desc" },
            },
            kitAssignments: {
              include: { item: true },
            },
          },
        },
      },
    });

    if (!termination) {
      return NextResponse.json(
        { error: "Desvinculación no encontrada" },
        { status: 404 }
      );
    }

    const employee = termination.employee;

    if (!employee) {
      console.error("Employee not found for termination:", id);
      return NextResponse.json(
        { error: "Empleado no encontrado para esta desvinculación" },
        { status: 404 }
      );
    }

    // Crear PDF
    let doc: jsPDF;
    let pageWidth: number;

    try {
      doc = new jsPDF();
      pageWidth = doc.internal.pageSize.getWidth();
    } catch (pdfError) {
      console.error("Error initializing jsPDF:", pdfError);
      return NextResponse.json(
        {
          error: "Error al inicializar generador de PDF",
          details: pdfError instanceof Error ? pdfError.message : String(pdfError)
        },
        { status: 500 }
      );
    }

    // Header con fondo oscuro
    doc.setFillColor(5, 14, 21);
    doc.rect(0, 0, pageWidth, 40, "F");

    // Agregar logo al header
    try {
      const logoPath = path.join(process.cwd(), "public", "logo-scl.png");
      if (fs.existsSync(logoPath)) {
        const logoData = fs.readFileSync(logoPath);
        const logoBase64 = logoData.toString("base64");
        doc.addImage(logoBase64, "PNG", 10, 5, 50, 25);
      }
    } catch (logoError) {
      console.error("Error loading logo for PDF:", logoError);
      // Continue without logo
    }

    // Título centrado a la derecha del logo
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("REPORTE DE DESVINCULACIÓN", pageWidth / 2 + 20, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text("Departamento de Recursos Humanos", pageWidth / 2 + 20, 23, { align: "center" });
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}`, pageWidth / 2 + 20, 30, { align: "center" });

    // Reset color
    doc.setTextColor(0, 0, 0);

    // Sección: Datos del Colaborador
    let yPos = 50;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DEL COLABORADOR", 15, yPos);

    yPos += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");

    const leftCol = 15;
    const midCol = pageWidth / 2 + 5;

    // Fila 1
    doc.setFont("helvetica", "bold");
    doc.text("RUT:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(employee.rut || "-", leftCol + 30, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("Fecha Ingreso:", midCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(employee.fechaIngreso), midCol + 35, yPos);

    // Fila 2
    yPos += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Nombre:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(`${employee.nombres} ${employee.apellidoPaterno} ${employee.apellidoMaterno || ""}`.trim(), leftCol + 30, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("Fecha Término:", midCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(termination.fechaDesvinculacion), midCol + 35, yPos);

    // Fila 3
    yPos += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Correo:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(employee.correoPersonal, leftCol + 30, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("Tipo Contrato:", midCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(employee.tipoContrato, midCol + 35, yPos);

    // Fila 4
    yPos += 7;
    doc.setFont("helvetica", "bold");
    doc.text("Cargo:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(employee.cargo || "-", leftCol + 30, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("Ubicación:", midCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(employee.ubicacion || "-", midCol + 35, yPos);

    // Sección: Estado de Devolución de Equipos
    yPos += 15;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("ESTADO DE DEVOLUCIÓN DE EQUIPOS", 15, yPos);

    yPos += 10;

    // Tabla de estados
    const estadosData: Array<[string, string]> = [
      ["Notebook", termination.estadoNotebook],
      ["Celular", termination.estadoCelular],
      ["Monitor", termination.estadoMonitor],
      ["Kit Bienvenida/EPP", termination.estadoKit],
    ];

    estadosData.forEach(([tipo, estado]) => {
      doc.setFont("helvetica", "bold");
      doc.text(`${tipo}:`, leftCol, yPos);

      // Color según estado - con validación
      const color = estadoColors[estado as keyof typeof estadoColors] || [0, 0, 0];
      doc.setTextColor(color[0], color[1], color[2]);
      doc.setFont("helvetica", "bold");
      doc.text(estadoLabels[estado as keyof typeof estadoLabels] || estado || "Desconocido", leftCol + 50, yPos);
      doc.setTextColor(0, 0, 0);

      yPos += 7;
    });

    // Fecha de devolución
    yPos += 3;
    doc.setFont("helvetica", "bold");
    doc.text("Fecha Devolución:", leftCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(termination.fechaDevolucionEquipos), leftCol + 45, yPos);

    doc.setFont("helvetica", "bold");
    doc.text("Recibido por:", midCol, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(termination.recibidoPor || "-", midCol + 35, yPos);

    // Sección: Equipos Asignados (Detalle)
    yPos += 15;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("DETALLE DE EQUIPOS ASIGNADOS", 15, yPos);

    yPos += 8;

    if (employee.assignments && employee.assignments.length > 0) {
      const assignmentsBody = employee.assignments
        .filter((a) => a.asset && a.asset.categoria)
        .map((a) => [
          a.asset.categoria.nombre || "-",
          `${a.asset.marca || ""} ${a.asset.modelo || ""}`.trim() || "-",
          a.asset.numeroSerie || "-",
          formatDate(a.fechaEntrega),
          a.estadoDevolucion ? estadoLabels[a.estadoDevolucion as keyof typeof estadoLabels] || a.estadoDevolucion : "Pendiente",
        ]);

      if (assignmentsBody.length > 0) {
        autoTable(doc, {
          startY: yPos,
          head: [["Tipo", "Marca/Modelo", "N° Serie", "Fecha Entrega", "Estado Dev."]],
          body: assignmentsBody,
          styles: { fontSize: 9 },
          headStyles: { fillColor: [5, 14, 21] },
          margin: { left: 15, right: 15 },
        });

        yPos = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : yPos + 20;
      } else {
        doc.setFontSize(10);
        doc.setFont("helvetica", "italic");
        doc.text("No hay equipos registrados", 15, yPos + 5);
        yPos += 15;
      }
    } else {
      doc.setFontSize(10);
      doc.setFont("helvetica", "italic");
      doc.text("No hay equipos registrados", 15, yPos + 5);
      yPos += 15;
    }

    // Sección: Descuentos
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("INFORMACIÓN DE DESCUENTOS", 15, yPos);

    yPos += 10;
    doc.setFontSize(10);

    if (termination.requiereDescuento) {
      doc.setTextColor(255, 0, 0);
      doc.setFont("helvetica", "bold");
      doc.text("SE REQUIERE DESCUENTO", leftCol, yPos);
      doc.setTextColor(0, 0, 0);

      yPos += 7;
      doc.setFont("helvetica", "bold");
      doc.text("Monto:", leftCol, yPos);
      doc.setFont("helvetica", "normal");
      const montoDescuento = termination.montoDescuento ? Number(termination.montoDescuento) : null;
      doc.text(formatCurrency(montoDescuento), leftCol + 30, yPos);

      yPos += 7;
      doc.setFont("helvetica", "bold");
      doc.text("Motivo:", leftCol, yPos);
      doc.setFont("helvetica", "normal");
      const motivoText = doc.splitTextToSize(termination.motivoDescuento || "-", pageWidth - 60);
      doc.text(motivoText, leftCol + 30, yPos);
      yPos += motivoText.length * 5;
    } else {
      doc.setTextColor(0, 128, 0);
      doc.setFont("helvetica", "bold");
      doc.text("NO REQUIERE DESCUENTO", leftCol, yPos);
      doc.setTextColor(0, 0, 0);
    }

    // Observaciones
    yPos += 15;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVACIONES", 15, yPos);

    yPos += 10;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const obsText = doc.splitTextToSize(termination.observaciones || "Sin observaciones", pageWidth - 30);
    doc.text(obsText, 15, yPos);

    // Firmas
    yPos = 245;
    doc.setLineWidth(0.3);

    // Firma TI
    doc.line(15, yPos, 85, yPos);
    doc.setFontSize(9);
    doc.text("Depto. Tecnología", 35, yPos + 5);
    doc.text(termination.recibidoPor || "Técnico IT", 15, yPos + 10);

    // Firma RRHH
    doc.line(pageWidth - 85, yPos, pageWidth - 15, yPos);
    doc.text("Depto. RRHH", pageWidth - 60, yPos + 5);

    // Estado de notificación
    yPos += 25;
    if (termination.notificadoRrhh) {
      doc.setFillColor(0, 128, 0);
      doc.setTextColor(255, 255, 255);
      doc.roundedRect(pageWidth / 2 - 40, yPos - 5, 80, 10, 2, 2, "F");
      doc.setFontSize(9);
      doc.text("RRHH NOTIFICADO", pageWidth / 2, yPos + 2, { align: "center" });
      if (termination.fechaNotificacionRrhh) {
        doc.setTextColor(0, 0, 0);
        doc.text(`Fecha: ${formatDate(termination.fechaNotificacionRrhh)}`, pageWidth / 2, yPos + 12, { align: "center" });
      }
    } else {
      doc.setFillColor(255, 165, 0);
      doc.setTextColor(255, 255, 255);
      doc.roundedRect(pageWidth / 2 - 50, yPos - 5, 100, 10, 2, 2, "F");
      doc.setFontSize(9);
      doc.text("PENDIENTE NOTIFICACIÓN RRHH", pageWidth / 2, yPos + 2, { align: "center" });
    }

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Sistema de Inventario IT - Documento generado automáticamente`,
      pageWidth / 2,
      285,
      { align: "center" }
    );

    // Generar PDF como buffer
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    } catch (pdfOutputError) {
      console.error("Error generating PDF buffer:", pdfOutputError);
      return NextResponse.json(
        {
          error: "Error al generar el archivo PDF",
          details: pdfOutputError instanceof Error ? pdfOutputError.message : String(pdfOutputError)
        },
        { status: 500 }
      );
    }

    // Marcar como notificado a RRHH si se genera el reporte
    try {
      await prisma.termination.update({
        where: { id },
        data: {
          notificadoRrhh: true,
          fechaNotificacionRrhh: new Date(),
        },
      });
    } catch (dbError) {
      console.error("Error updating termination record:", dbError);
      // Continue anyway - the PDF was generated successfully
    }

    // Retornar PDF
    return new NextResponse(pdfBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="reporte_rrhh_${(employee.rut || employee.id).replace(/\./g, "")}_${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar reporte RRHH');
  }
}
