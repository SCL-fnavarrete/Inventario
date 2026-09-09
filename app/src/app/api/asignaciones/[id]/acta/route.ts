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

// GET /api/asignaciones/[id]/acta - Generar acta de entrega/devolución PDF
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('asignaciones', 'read');
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const tipo = searchParams.get("tipo") || "entrega"; // entrega o devolucion

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        asset: {
          include: {
            categoria: true,
          },
        },
        employee: true,
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Asignación no encontrada" },
        { status: 404 }
      );
    }

    // Crear PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header con fondo oscuro (mismo estilo que reporte RRHH)
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
    const titulo = tipo === "entrega" ? "ACTA DE ENTREGA DE EQUIPO" : "ACTA DE DEVOLUCIÓN DE EQUIPO";
    doc.text(titulo, pageWidth / 2 + 20, 15, { align: "center" });
    doc.setFontSize(11);
    doc.text("Departamento de Tecnología", pageWidth / 2 + 20, 23, { align: "center" });
    doc.setFontSize(9);
    doc.text(`Generado: ${new Date().toLocaleDateString("es-CL")}`, pageWidth / 2 + 20, 30, { align: "center" });

    // Reset color
    doc.setTextColor(0, 0, 0);

    // Datos del empleado
    doc.setFillColor(240, 240, 240);
    doc.rect(10, 45, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DEL COLABORADOR", 15, 50);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);

    const empleadoData = [
      ["RUT:", assignment.employee.rut || "-"],
      ["Nombre:", `${assignment.employee.nombres} ${assignment.employee.apellidoPaterno} ${assignment.employee.apellidoMaterno || ""}`],
      ["Correo:", assignment.employee.correoPersonal],
      ["Cargo:", assignment.employee.cargo || "-"],
      ["Jefatura:", assignment.employee.jefatura || "-"],
      ["Ubicación:", assignment.employee.ubicacion || "-"],
    ];

    let yPos = 60;
    empleadoData.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 15, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(value.trim(), 50, yPos);
      yPos += 6;
    });

    // Datos del equipo
    yPos += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("DATOS DEL EQUIPO", 15, yPos);

    yPos += 10;
    doc.setFontSize(10);

    const equipoData = [
      ["Tipo:", assignment.asset.categoria.nombre],
      ["Marca:", assignment.asset.marca],
      ["Modelo:", assignment.asset.modelo],
      ["N° Serie:", assignment.asset.numeroSerie || "-"],
    ];

    // Agregar campos específicos según categoría
    if (assignment.asset.categoria.nombre.toLowerCase() === "notebook") {
      equipoData.push(
        ["Procesador:", assignment.asset.procesador || "-"],
        ["RAM:", assignment.asset.ram || "-"],
        ["Disco:", assignment.asset.discoDuro || "-"],
        ["S.O.:", assignment.asset.sistemaOperativo || "-"]
      );
    } else if (assignment.asset.categoria.nombre.toLowerCase() === "celular") {
      equipoData.push(
        ["IMEI:", assignment.asset.imei || "-"],
        ["N° Teléfono:", assignment.asset.numeroTelefono || "-"],
        ["Plan:", assignment.asset.tipoPlan || "-"]
      );
    }

    equipoData.forEach(([label, value]) => {
      doc.setFont("helvetica", "bold");
      doc.text(label, 15, yPos);
      doc.setFont("helvetica", "normal");
      doc.text(value || "-", 50, yPos);
      yPos += 6;
    });

    // Datos de la entrega/devolución
    yPos += 10;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(tipo === "entrega" ? "DATOS DE LA ENTREGA" : "DATOS DE LA DEVOLUCIÓN", 15, yPos);

    yPos += 10;
    doc.setFontSize(10);

    if (tipo === "entrega") {
      const entregaData = [
        ["Fecha:", formatDate(assignment.fechaEntrega)],
        ["Lugar:", assignment.lugarEntrega || "-"],
        ["Entregado por:", assignment.entregadoPor || "-"],
        ["Tipo:", assignment.tipoMovimiento],
        ["Motivo:", assignment.motivo || "Ingreso nuevo colaborador"],
      ];

      entregaData.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, 15, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(value, 50, yPos);
        yPos += 6;
      });
    } else {
      const devolucionData = [
        ["Fecha devolución:", formatDate(assignment.fechaDevolucion)],
        ["Recibido por:", assignment.recibidoPor || "-"],
        ["Estado:", assignment.estadoDevolucion || "-"],
        ["Observaciones:", assignment.observacionesDevolucion || "Sin observaciones"],
      ];

      devolucionData.forEach(([label, value]) => {
        doc.setFont("helvetica", "bold");
        doc.text(label, 15, yPos);
        doc.setFont("helvetica", "normal");
        doc.text(value, 55, yPos);
        yPos += 6;
      });
    }

    // Declaración
    yPos += 10;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const declaracion = tipo === "entrega"
      ? "El colaborador declara haber recibido el equipo descrito en buen estado y se compromete a utilizarlo exclusivamente para fines laborales, siendo responsable de su cuidado y conservación."
      : "El colaborador declara haber devuelto el equipo en el estado indicado. El Departamento de TI ha verificado y recibido el equipo conforme.";

    const splitText = doc.splitTextToSize(declaracion, pageWidth - 30);
    doc.text(splitText, 15, yPos);

    // Firmas
    yPos = 230;
    doc.setLineWidth(0.3);

    // Firma colaborador
    doc.line(15, yPos, 85, yPos);
    doc.setFontSize(9);
    doc.text("Firma Colaborador", 35, yPos + 5);
    doc.text(`${assignment.employee.nombres} ${assignment.employee.apellidoPaterno}`, 15, yPos + 10);
    doc.text(`RUT: ${assignment.employee.rut || "-"}`, 15, yPos + 15);

    // Firma TI
    doc.line(pageWidth - 85, yPos, pageWidth - 15, yPos);
    doc.text("Firma Depto. TI", pageWidth - 65, yPos + 5);
    const responsable = tipo === "entrega" ? assignment.entregadoPor : assignment.recibidoPor;
    doc.text(responsable || "Técnico IT", pageWidth - 85, yPos + 10);

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
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    // Retornar PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="acta_${tipo}_${(assignment.employee.rut || assignment.employee.id).replace(/\./g, "")}_${assignment.asset.numeroSerie || assignment.id}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar acta PDF');
  }
}
