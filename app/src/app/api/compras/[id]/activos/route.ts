import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { agregarEquiposCompraSchema } from "@/modules/compras";
import { requirePermission, handleApiError, respuestaDatosInvalidos, quienHace } from '@/shared/auth/guard';
import { ValidationError } from '@/shared/errores';
import {
  agregarEquiposACompra,
  buscarCompra,
  equiposDeCompra,
  quitarEquiposDeCompra,
} from '@/modules/compras/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id]/activos - Equipos de una compra (admin y tecnico)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'read');
    const { id } = await params;
    await buscarCompra(id);
    const data = await equiposDeCompra(id);
    return NextResponse.json({ data, stats: { totalActivos: data.length } });
  } catch (error) {
    return handleApiError(error, 'Error al obtener activos de la compra');
  }
}

// POST /api/compras/[id]/activos - Agregar equipos a una compra (solo admin)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');
    const { id } = await params;
    const parsed = agregarEquiposCompraSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    const equipos = await agregarEquiposACompra(id, parsed.data, quienHace(session));
    return NextResponse.json(equipos, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al agregar equipos a la compra');
  }
}

// DELETE /api/compras/[id]/activos?assetIds=... - Quitar equipos de una compra (solo admin)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');
    const { id } = await params;
    const ids = z
      .array(z.string().uuid())
      .min(1)
      .safeParse((request.nextUrl.searchParams.get("assetIds") || "").split(",").filter(Boolean));
    if (!ids.success) throw new ValidationError('Indica los equipos a quitar');
    const cantidad = await quitarEquiposDeCompra(id, ids.data, quienHace(session));
    return NextResponse.json({ message: `${cantidad} equipo(s) quitado(s) de la compra`, deletedCount: cantidad });
  } catch (error) {
    return handleApiError(error, 'Error al quitar equipos de la compra');
  }
}
