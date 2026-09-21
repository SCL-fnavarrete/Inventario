import { NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { generarNumeroGuia } from '@/lib/services/guiaDespachoService';

// GET /api/guias-despacho/numero - Obtener próximo número de guía.
// Sin caller en el frontend hoy; se deja disponible para previsualizar el
// numero, reutilizando generarNumeroGuia() en vez de duplicar la logica.
export async function GET() {
  try {
    await requirePermission('guias', 'read');
    const numero = await generarNumeroGuia();
    return NextResponse.json({ numero });
  } catch (error) {
    return handleApiError(error, 'Error al obtener número de guía');
  }
}
