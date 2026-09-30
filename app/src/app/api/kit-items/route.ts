import { NextRequest, NextResponse } from "next/server";
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import { createKitItemSchema } from '@/modules/kit-epp';
import { crearArticuloKit, listarArticulosKit } from '@/modules/kit-epp/servidor';

// GET /api/kit-items?categoria=kit_bienvenida|epp - Catalogo de Kit/EPP con su stock
export async function GET(request: NextRequest) {
  try {
    await requirePermission('kitEpp', 'read');
    const searchParams = request.nextUrl.searchParams;
    const items = await listarArticulosKit({
      categoria: searchParams.get('categoria'),
      sedeId: searchParams.get("sedeId") || "",
    });
    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, 'Error al obtener artículos de Kit/EPP');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('kitEpp', 'write');
    const item = await crearArticuloKit(createKitItemSchema.parse(await request.json()), quienHace(session));
    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear artículo de Kit/EPP');
  }
}
