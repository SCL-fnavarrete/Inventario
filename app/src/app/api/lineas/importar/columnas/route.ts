import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from '@/shared/utilidades/limiteUso';
import { validarArchivoExcel } from '@/modules/importacion';
import { columnasDeHoja } from '@/modules/lineas/excel';

export const maxDuration = 60;

// Importacion de lineas, paso 2: columnas de la hoja, ejemplo y mapeo propuesto.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, 'importarArchivo');
    const form = await request.formData();
    const buffer = await validarArchivoExcel(form.get('file'));
    const hoja = z.string().min(1, 'Elige la hoja').max(200).parse(form.get('hoja'));
    return NextResponse.json(await columnasDeHoja(buffer, hoja));
  } catch (error) {
    return handleApiError(error, 'Error al leer la hoja');
  }
}
