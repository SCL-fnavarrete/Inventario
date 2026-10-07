import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from '@/shared/utilidades/limiteUso';
import { guiaDeActivos, guiaDeHistorial } from '@/modules/importacion';
import { plantillaExcel } from '@/modules/importacion/servidor';
import { guiaDeLineas } from '@/modules/lineas';

const consultaSchema = z.object({
  tipo: z.enum(['equipos', 'lineas', 'historial']),
  ficha: z.string().max(40).nullable().optional(),
  categoria: z.string().max(100).nullable().optional(),
});

// Plantilla descargable de una importacion (SPEC 2.133): los encabezados exactos que
// reconoce el importador, un ejemplo y la guia. Solo admin, como la importacion.
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, 'documento');
    const p = request.nextUrl.searchParams;
    const { tipo, ficha, categoria } = consultaSchema.parse({ tipo: p.get('tipo'), ficha: p.get('ficha'), categoria: p.get('categoria') });
    const guia = tipo === 'lineas' ? guiaDeLineas() : tipo === 'historial' ? guiaDeHistorial() : guiaDeActivos(ficha, categoria);
    return new NextResponse(new Uint8Array(await plantillaExcel(guia)), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${guia.archivoPlantilla}"`,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al generar la plantilla');
  }
}
