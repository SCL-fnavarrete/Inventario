import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { validarArchivoExcel } from '@/modules/importacion';
import { importarLineas } from '@/modules/lineas/servidor';

// POST: importa la conciliacion de lineas (Excel con la hoja "Consolidado").
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('lineas', 'write');
    const buffer = await validarArchivoExcel((await request.formData()).get('file'));
    return NextResponse.json(await importarLineas(buffer, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al importar líneas');
  }
}
