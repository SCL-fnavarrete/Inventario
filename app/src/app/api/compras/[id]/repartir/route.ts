import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { repartoCompraSchema } from "@/lib/validations/purchase";
import { repartirCompra } from '@/lib/services/compraService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/compras/[id]/repartir - Repartir parte de una compra a una sede
// (SPEC 2.111.3, solo admin). A la sede de llegada queda disponible en el
// momento; a otra sede sale en un despacho vinculado a la compra.
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');
    const { id } = await params;

    const validacion = repartoCompraSchema.safeParse(await request.json());
    if (!validacion.success) return respuestaDatosInvalidos(validacion.error);

    const resultado = await repartirCompra(id, validacion.data, {
      emisor: session.user.name || session.user.email || 'Administrador',
      usuario: session.user.email || 'sistema',
    });

    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al repartir la compra');
  }
}
