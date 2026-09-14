import { NextResponse } from "next/server";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { generarNumeroGuia } from '@/lib/services/guiaDespachoService';

// GET /api/guias-despacho/numero - Obtener próximo número de guía
//
// Sin caller hoy (nadie en el frontend lo llama -- confirmado 14-sep-2026,
// SPEC 2.26). Se deja disponible por si una futura pantalla necesita
// previsualizar el número antes de crear la guía, pero ya no duplica la
// lógica: ambos usan generarNumeroGuia().
export async function GET() {
  try {
    await requirePermission('guias', 'read');
    const numero = await generarNumeroGuia();
    return NextResponse.json({ numero });
  } catch (error) {
    return handleApiError(error, 'Error al obtener número de guía');
  }
}
