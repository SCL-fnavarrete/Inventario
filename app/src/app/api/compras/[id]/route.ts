import { NextRequest, NextResponse } from "next/server";
import { updatePurchaseSchema } from "@/modules/compras";
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';
import { detalleCompra, editarCompra, eliminarCompra } from '@/modules/compras/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id] - Compra con sus equipos, su Kit/EPP y el avance del
// reparto. La ven admin y tecnico (SPEC 2.111.6).
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'read');

    const { id } = await params;

    return NextResponse.json(await detalleCompra(id));
  } catch (error) {
    return handleApiError(error, 'Error al obtener compra');
  }
}

// PUT /api/compras/[id] - Editar los datos de la factura (solo admin). La
// sede de llegada solo cambia mientras no se haya repartido nada.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');
    const { id } = await params;
    const parsed = updatePurchaseSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await editarCompra(id, parsed.data, quienHace(session)));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar compra');
  }
}

// DELETE /api/compras/[id] - Eliminar una compra (solo admin), solo si no se
// repartio nada (SPEC 2.111.7).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');
    const { id } = await params;
    await eliminarCompra(id, quienHace(session));
    return NextResponse.json({ message: "Compra eliminada exitosamente" });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar compra');
  }
}
