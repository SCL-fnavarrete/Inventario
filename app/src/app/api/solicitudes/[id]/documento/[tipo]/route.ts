import { NextRequest, NextResponse } from 'next/server';
import { documentoDeSolicitud } from '@/modules/solicitudes/documentos';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from "@/shared/utilidades/limiteUso";

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

// GET /api/solicitudes/[id]/documento/[tipo] - Generar y descargar el PDF
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; tipo: string }> }) {
  try {
    const session = await requirePermission('solicitudes', 'read');
    exigirCupo(session.user.id, "documento");
    const { id, tipo } = await params;
    const { pdf, nombreArchivo } = await documentoDeSolicitud(id, tipo);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar documento');
  }
}
