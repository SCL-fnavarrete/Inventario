import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  generateAnexoEntrega,
  generateComprobanteEntrega,
  generateComprobanteCambio,
  generateActaDevolucion,
} from '@/lib/services/documentGeneratorService';

const VALID_TIPOS = [
  'anexo-entrega',
  'comprobante-entrega',
  'comprobante-cambio',
  'acta-devolucion',
] as const;

type DocTipo = (typeof VALID_TIPOS)[number];

const docNames: Record<DocTipo, string> = {
  'anexo-entrega': 'Anexo_Entrega_Equipos',
  'comprobante-entrega': 'Comprobante_Entrega',
  'comprobante-cambio': 'Comprobante_Cambio',
  'acta-devolucion': 'Acta_Devolucion',
};

// GET /api/solicitudes/[id]/documento/[tipo] - Generate and download PDF
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; tipo: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const { id, tipo } = await params;

    if (!VALID_TIPOS.includes(tipo as DocTipo)) {
      return NextResponse.json(
        { error: `Tipo de documento inválido. Opciones: ${VALID_TIPOS.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify request exists
    const solicitud = await prisma.workflowRequest.findUnique({
      where: { id },
      select: { id: true, numero: true, tipo: true, estado: true },
    });

    if (!solicitud) {
      return NextResponse.json({ error: 'Solicitud no encontrada' }, { status: 404 });
    }

    let pdfBuffer: Buffer;

    switch (tipo as DocTipo) {
      case 'anexo-entrega':
        pdfBuffer = await generateAnexoEntrega(id);
        break;
      case 'comprobante-entrega':
        pdfBuffer = await generateComprobanteEntrega(id);
        break;
      case 'comprobante-cambio':
        pdfBuffer = await generateComprobanteCambio(id);
        break;
      case 'acta-devolucion':
        pdfBuffer = await generateActaDevolucion(id);
        break;
      default:
        return NextResponse.json({ error: 'Tipo no soportado' }, { status: 400 });
    }

    const fileName = `${docNames[tipo as DocTipo]}_${solicitud.numero}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating document:', error);
    const message = error instanceof Error ? error.message : 'Error al generar documento';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
