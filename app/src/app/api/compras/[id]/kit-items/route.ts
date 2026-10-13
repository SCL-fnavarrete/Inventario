import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { linkKitItemsToPurchaseSchema } from "@/modules/compras";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { ValidationError } from '@/shared/errores';
import {
  agregarKitACompra,
  buscarCompra,
  lineasKitDeCompra,
  quitarKitDeCompra,
} from '@/modules/compras/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id]/kit-items - Líneas de Kit/EPP de una compra
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'read');
    const { id } = await params;
    await buscarCompra(id);
    const data = await lineasKitDeCompra(id);
    return NextResponse.json({ data, stats: { totalArticulos: data.length } });
  } catch (error) {
    return handleApiError(error, 'Error al obtener artículos de Kit/EPP de la compra');
  }
}

// POST /api/compras/[id]/kit-items - Agregar Kit/EPP a una compra (admin y técnico)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'write');
    const { id } = await params;
    const parsed = linkKitItemsToPurchaseSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await agregarKitACompra(id, parsed.data), { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al agregar artículos de Kit/EPP a la compra');
  }
}

// DELETE /api/compras/[id]/kit-items?lineIds=... - Quitar líneas no repartidas (admin y técnico)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'delete');
    const { id } = await params;
    const ids = z
      .array(z.string().uuid())
      .min(1)
      .safeParse((request.nextUrl.searchParams.get("lineIds") || "").split(",").filter(Boolean));
    if (!ids.success) throw new ValidationError('Indica las líneas a quitar');
    const cantidad = await quitarKitDeCompra(id, ids.data);
    return NextResponse.json({
      message: `${cantidad} artículo(s) de Kit/EPP quitado(s) de la compra`,
      deletedCount: cantidad,
    });
  } catch (error) {
    return handleApiError(error, 'Error al quitar artículos de Kit/EPP de la compra');
  }
}
