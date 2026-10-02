import { NextResponse } from 'next/server';
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { opcionesLinea } from '@/modules/lineas/servidor';

// GET: celulares y personas para asociar a una linea.
export async function GET() {
  try {
    await requirePermission('lineas', 'read');
    return NextResponse.json(await opcionesLinea());
  } catch (error) {
    return handleApiError(error, 'Error al obtener opciones de líneas');
  }
}
