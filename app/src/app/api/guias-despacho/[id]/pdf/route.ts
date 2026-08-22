import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import QRCode from "qrcode";
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

const TIPO_DESPACHO_LABELS: Record<string, string> = {
  asignacion: "Asignación",
  traslado: "Traslado",
  prestamo: "Préstamo",
};

const CONDICION_LABELS: Record<string, string> = {
  nuevo: "Nuevo",
  usado: "Usado",
  danado: "Dañado",
};

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatDateTime(date: Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function generatePage(
  doc: jsPDF,
  guide: NonNullable<Awaited<ReturnType<typeof getGuideData>>>,
  qrDataUrl: string,
  copyType: "ORIGINAL" | "COPIA DESTINATARIO",
  logoBase64: string | null
) {
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header con fondo oscuro
  doc.setFillColor(5, 14, 21);
  doc.rect(0, 0, pageWidth, 45, "F");

  // Logo
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, "PNG", 10, 5, 45, 22);
    } catch {
      // Continue without logo
    }
  }

  // Título y número
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("GUÍA DE DESPACHO", pageWidth / 2, 15, { align: "center" });

  doc.setFontSize(12);
  doc.text(`N° ${guide.numero}`, pageWidth / 2, 24, { align: "center" });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${formatDateTime(guide.fechaDespacho)}`, pageWidth / 2, 32, { align: "center" });

  // QR Code
  try {
    doc.addImage(qrDataUrl, "PNG", pageWidth - 45, 5, 35, 35);
  } catch {
    // Continue without QR
  }

  // Tipo de copia (Original / Copia)
  doc.setFillColor(100, 100, 100);
  doc.rect(0, 45, pageWidth, 8, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(255, 255, 255);
  doc.text(copyType, pageWidth / 2, 50.5, { align: "center" });

  // Reset color
  doc.setTextColor(0, 0, 0);

  // Sección: Datos del Despacho
  let yPos = 60;
  doc.setFillColor(240, 240, 240);
  doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL DESPACHO", 15, yPos);

  yPos += 10;
  doc.setFontSize(9);

  const despachoData = [
    ["Origen:", guide.origen],
    ["Destino:", guide.destino],
    ["Tipo:", TIPO_DESPACHO_LABELS[guide.tipoDespacho] || guide.tipoDespacho],
    ["Despachado por:", guide.despachadoPor],
  ];

  despachoData.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 15, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(value || "-", 55, yPos);
    yPos += 5;
  });

  // Sección: Datos del Destinatario
  yPos += 5;
  doc.setFillColor(240, 240, 240);
  doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("DATOS DEL DESTINATARIO", 15, yPos);

  yPos += 10;
  doc.setFontSize(9);

  const destinatarioData = [
    ["Nombre:", guide.destinatarioNombre || "-"],
    ["RUT:", guide.destinatarioRut || "-"],
  ];

  if (guide.destinatario) {
    destinatarioData.push(
      ["Cargo:", guide.destinatario.cargo || "-"],
      ["Ubicación:", guide.destinatario.ubicacion || "-"],
      ["Correo:", guide.destinatario.correo || "-"]
    );
  }

  destinatarioData.forEach(([label, value]) => {
    doc.setFont("helvetica", "bold");
    doc.text(label, 15, yPos);
    doc.setFont("helvetica", "normal");
    doc.text(value, 55, yPos);
    yPos += 5;
  });

  // Sección: Detalle de Equipos
  yPos += 5;
  doc.setFillColor(240, 240, 240);
  doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("DETALLE DE EQUIPOS", 15, yPos);

  yPos += 5;

  // Preparar datos de la tabla
  const tableData = guide.items.map((item, index) => {
    const asset = item.asset;
    const categoria = asset.categoria.nombre.toLowerCase();

    let specs = "";
    if (categoria === "notebook") {
      const specParts = [];
      if (asset.procesador) specParts.push(`Proc: ${asset.procesador}`);
      if (asset.ram) specParts.push(`RAM: ${asset.ram}`);
      if (asset.discoDuro) specParts.push(`Disco: ${asset.discoDuro}`);
      if (asset.sistemaOperativo) specParts.push(`SO: ${asset.sistemaOperativo}`);
      specs = specParts.join(" | ");
    } else if (categoria === "celular") {
      const specParts = [];
      if (asset.numeroTelefono) specParts.push(`Tel: ${asset.numeroTelefono}`);
      if (asset.tipoPlan) specParts.push(`Plan: ${asset.tipoPlan}`);
      specs = specParts.join(" | ");
    }

    return [
      (index + 1).toString(),
      asset.categoria.nombre,
      `${asset.marca} ${asset.modelo}`,
      asset.numeroSerie || "-",
      asset.imei || "-",
      CONDICION_LABELS[asset.condicion] || asset.condicion,
      specs,
    ];
  });

  autoTable(doc, {
    startY: yPos,
    head: [["N°", "Tipo", "Marca/Modelo", "N° Serie", "IMEI", "Estado", "Especificaciones"]],
    body: tableData,
    theme: "grid",
    headStyles: {
      fillColor: [5, 14, 21],
      textColor: [255, 255, 255],
      fontSize: 8,
      fontStyle: "bold",
    },
    bodyStyles: {
      fontSize: 7,
      cellPadding: 2,
    },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 22 },
      2: { cellWidth: 35 },
      3: { cellWidth: 25 },
      4: { cellWidth: 25 },
      5: { cellWidth: 18, halign: "center" },
      6: { cellWidth: "auto" },
    },
    margin: { left: 10, right: 10 },
  });

  yPos = doc.lastAutoTable?.finalY || yPos + 50;

  // Total de items
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Total de Items: ${guide.items.length}`, 15, yPos + 8);

  // Observaciones
  if (guide.observaciones) {
    yPos += 15;
    doc.setFillColor(240, 240, 240);
    doc.rect(10, yPos - 5, pageWidth - 20, 8, "F");
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("OBSERVACIONES", 15, yPos);

    yPos += 8;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const splitObs = doc.splitTextToSize(guide.observaciones, pageWidth - 30);
    doc.text(splitObs, 15, yPos);
    yPos += splitObs.length * 4;
  }

  // Declaración y Firmas
  yPos = Math.max(yPos + 10, 220);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  const declaracion = "Declaro haber recibido los equipos detallados en esta guía de despacho, en las condiciones indicadas, comprometiéndome a su correcto uso y cuidado.";
  const splitDecl = doc.splitTextToSize(declaracion, pageWidth - 30);
  doc.text(splitDecl, 15, yPos);

  // Firmas
  yPos += 20;
  doc.setLineWidth(0.3);

  // Firma entregado por
  doc.line(15, yPos, 85, yPos);
  doc.setFontSize(8);
  doc.text("Entregado por", 35, yPos + 5);
  doc.text(`Nombre: ${guide.despachadoPor}`, 15, yPos + 10);
  doc.text("RUT: _________________", 15, yPos + 15);
  doc.text("Fecha: _________________", 15, yPos + 20);

  // Firma recibido por
  doc.line(pageWidth - 85, yPos, pageWidth - 15, yPos);
  doc.text("Recibido por", pageWidth - 65, yPos + 5);
  doc.text(`Nombre: ${guide.destinatarioNombre || "_________________"}`, pageWidth - 85, yPos + 10);
  doc.text(`RUT: ${guide.destinatarioRut || "_________________"}`, pageWidth - 85, yPos + 15);
  doc.text("Fecha: _________________", pageWidth - 85, yPos + 20);

  // Footer
  doc.setFontSize(7);
  doc.setTextColor(128, 128, 128);
  doc.text(
    `Sistema de Inventario IT | Guía generada el ${formatDateTime(new Date())}`,
    pageWidth / 2,
    287,
    { align: "center" }
  );
}

async function getGuideData(id: string) {
  return prisma.dispatchGuide.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          asset: {
            include: {
              categoria: true,
            },
          },
        },
      },
      destinatario: {
        select: {
          id: true,
          rut: true,
          nombres: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          cargo: true,
          ubicacion: true,
          correo: true,
        },
      },
    },
  });
}

// GET /api/guias-despacho/[id]/pdf - Generar PDF de guía de despacho
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('guias', 'read');
    const { id } = await params;

    const guide = await getGuideData(id);

    if (!guide) {
      return NextResponse.json(
        { error: "Guía de despacho no encontrada" },
        { status: 404 }
      );
    }

    // Generar QR Code con URL de validación
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const qrUrl = `${baseUrl}/guias-despacho/${guide.id}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 150,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });

    // Cargar logo
    let logoBase64: string | null = null;
    try {
      const logoPath = path.join(process.cwd(), "public", "logo-scl.png");
      if (fs.existsSync(logoPath)) {
        const logoData = fs.readFileSync(logoPath);
        logoBase64 = logoData.toString("base64");
      }
    } catch {
      // Continue without logo
    }

    // Crear PDF
    const doc = new jsPDF();

    // Página 1: Original
    await generatePage(doc, guide, qrDataUrl, "ORIGINAL", logoBase64);

    // Página 2: Copia
    doc.addPage();
    await generatePage(doc, guide, qrDataUrl, "COPIA DESTINATARIO", logoBase64);

    // Generar PDF como buffer
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    // Retornar PDF
    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="guia_despacho_${guide.numero.replace(/\//g, "-")}.pdf"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar PDF de guía de despacho');
  }
}
