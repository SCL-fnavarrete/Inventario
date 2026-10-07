import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { exigirCupo } from '@/shared/utilidades/limiteUso';
import { tandaImportacionSchema } from '@/modules/lineas';
import { importarTandaLineas } from '@/modules/lineas/excel';

export const maxDuration = 60;

// Importacion de lineas, paso 4: guarda una tanda de filas ya revisadas.
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('configuracion', 'write');
    exigirCupo(session.user.id, 'importarTanda');
    const { filas, fechaDatos } = tandaImportacionSchema.parse(await request.json());
    return NextResponse.json(await importarTandaLineas(filas, fechaDatos, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al importar líneas');
  }
}
