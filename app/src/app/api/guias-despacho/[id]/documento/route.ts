import { NextRequest, NextResponse } from 'next/server';
import { generateGuiaDespacho } from '@/modules/despachos/documentos';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from '@/shared/utilidades/limiteUso';

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

// GET /api/guias-despacho/[id]/documento - Genera y descarga la guia en PDF
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requirePermission('guias', 'read');
    exigirCupo(session.user.id, 'documento');
    const { id } = await params;
    const { pdf, nombreArchivo } = await generateGuiaDespacho(id);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar la guía de despacho');
  }
}
