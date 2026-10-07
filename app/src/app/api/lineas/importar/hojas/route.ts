import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { exigirCupo } from '@/shared/utilidades/limiteUso';
import { validarArchivoExcel } from '@/modules/importacion';
import { hojasDelArchivo } from '@/modules/lineas/excel';

// Importacion de lineas, paso 1 (SPEC 2.131): las hojas del archivo. Solo
// admin, como la importacion de activos (configuracion/write).
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, 'importarArchivo');
    const buffer = await validarArchivoExcel((await request.formData()).get('file'));
    return NextResponse.json(await hojasDelArchivo(buffer));
  } catch (error) {
    return handleApiError(error, 'Error al leer el archivo');
  }
}
