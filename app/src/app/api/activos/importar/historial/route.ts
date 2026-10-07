import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from '@/shared/utilidades/limiteUso';
import { validarArchivoExcel } from '@/modules/importacion';
import { importarHistorial } from '@/modules/importacion/servidor';

// Operacion pesada: hasta 60 s (Vercel corta antes por defecto).
export const maxDuration = 60;

// Historial de equipos (SPEC 2.133): las entregas anteriores del archivo normalizado
// quedan como asignaciones cerradas. Sin `confirmar` solo se revisa: no escribe nada.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, 'importarArchivo');
    const form = await request.formData();
    const buffer = await validarArchivoExcel(form.get('file'));
    return NextResponse.json(await importarHistorial(buffer, session, form.get('confirmar') === 'true'));
  } catch (error) {
    return handleApiError(error, 'Error al importar el historial de equipos');
  }
}
