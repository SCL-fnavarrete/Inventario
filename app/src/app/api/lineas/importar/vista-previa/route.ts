import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from '@/shared/utilidades/limiteUso';
import { validarArchivoExcel } from '@/modules/importacion';
import { mapeoLineasSchema } from '@/modules/lineas';
import { vistaPreviaLineas } from '@/modules/lineas/excel';

export const maxDuration = 60;

// Importacion de lineas, paso 3: valida todas las filas sin guardar nada.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, 'importarArchivo');
    const form = await request.formData();
    const buffer = await validarArchivoExcel(form.get('file'));
    const hoja = z.string().min(1, 'Elige la hoja').max(200).parse(form.get('hoja'));
    const mapeo = mapeoLineasSchema.parse(String(form.get('mapeo') ?? '{}'));
    return NextResponse.json(await vistaPreviaLineas(buffer, hoja, mapeo));
  } catch (error) {
    return handleApiError(error, 'Error al validar el archivo');
  }
}
