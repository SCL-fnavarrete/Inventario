import { NextRequest, NextResponse } from "next/server";
import { createPurchaseWithAssetsSchema, purchaseFiltersSchema } from "@/modules/compras";
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';
import { listarCompras, registrarCompra } from '@/modules/compras/servidor';

// GET /api/compras - Listar compras/facturas con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    await requirePermission('compras', 'read');

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = purchaseFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      sedeId: searchParams.get("sedeId") || undefined,
      tipoCompra: searchParams.get("tipoCompra") || undefined,
      fechaDesde: searchParams.get("fechaDesde") || undefined,
      fechaHasta: searchParams.get("fechaHasta") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "fechaFactura",
      sortOrder: searchParams.get("sortOrder") || "desc",
    });

    if (!filtersResult.success) {
      return respuestaDatosInvalidos(filtersResult.error);
    }

    return NextResponse.json(await listarCompras(filtersResult.data, searchParams.get("vista")));
  } catch (error) {
    return handleApiError(error, 'Error al obtener compras');
  }
}

// POST /api/compras - Registrar una compra (SPEC 2.111.1; admin y técnico)
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('compras', 'write');
    const parsed = createPurchaseWithAssetsSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const compra = await registrarCompra(parsed.data, quienHace(session));
    return NextResponse.json(compra, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear compra');
  }
}
