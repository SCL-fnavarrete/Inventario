import { NextRequest, NextResponse } from "next/server";
import type { EstadoGuia } from "@prisma/client";
import { leerPaginacion } from "@/shared/utilidades/paginacion";
import { requirePermission, handleApiError, quienHace } from '@/shared/auth/guard';
import type { VistaGuia } from '@/modules/despachos';
import { listarDespachos, registrarDespacho } from '@/modules/despachos/servidor';

// GET /api/guias-despacho - Listar despachos
export async function GET(request: NextRequest) {
  try {
    await requirePermission('guias', 'read');
    const searchParams = request.nextUrl.searchParams;
    const resultado = await listarDespachos({
      estado: searchParams.get("estado") as EstadoGuia | null,
      busqueda: searchParams.get("busqueda") ?? "",
      vista: searchParams.get("vista") as VistaGuia | null,
      sedeId: searchParams.get("sedeId") || "",
      ...leerPaginacion(searchParams),
    });
    return NextResponse.json(resultado);
  } catch (error) {
    return handleApiError(error, 'Error al obtener los despachos');
  }
}

// POST /api/guias-despacho - Crear un despacho (SPEC 2.108)
export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('guias', 'write');
    const guia = await registrarDespacho(await request.json(), {
      usuario: quienHace(session),
      nombre: session.user?.name,
    });
    return NextResponse.json(guia, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear el despacho');
  }
}
