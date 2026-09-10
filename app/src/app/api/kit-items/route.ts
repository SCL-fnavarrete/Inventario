import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere, sedeIdParaCrear } from '@/lib/auth/sedeScope';
import { createKitItemSchema } from '@/lib/validations/kitItem';

// GET /api/kit-items?categoria=kit_bienvenida|epp
// Catalogo de articulos de Kit de Bienvenida y EPP, con su stock actual.
// Separado de /api/activos a proposito: Kit/EPP no son equipos (ver
// prisma/schema.prisma, modelo WelcomeKitItem). Catalogo separado por sede
// (SPEC 2.9): admin ve todo, tecnico solo el de su sede.
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('kitEpp', 'read');

    const categoria = request.nextUrl.searchParams.get('categoria');

    const items = await prisma.welcomeKitItem.findMany({
      where: {
        ...sedeWhere(session),
        ...(categoria ? { categoria: categoria as 'kit_bienvenida' | 'epp' } : {}),
      },
      // El nombre de la sede solo lo necesita la UI de admin (que ve varias
      // sedes mezcladas); para tecnico es siempre la suya.
      include: { sede: { select: { nombre: true } } },
      orderBy: { nombre: 'asc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, 'Error al obtener artículos de Kit/EPP');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('kitEpp', 'write');

    const body = await request.json();
    const validated = createKitItemSchema.parse(body);
    const sedeId = sedeIdParaCrear(session, validated.sedeId);

    // El nombre no se duplica dentro de la misma sede/categoria, pero dos
    // sedes distintas si pueden tener un articulo con el mismo nombre --
    // son catalogos independientes.
    const existing = await prisma.welcomeKitItem.findFirst({
      where: {
        nombre: { equals: validated.nombre, mode: 'insensitive' },
        categoria: validated.categoria,
        sedeId,
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un artículo con ese nombre en esta categoría para esta sede' },
        { status: 400 }
      );
    }

    const item = await prisma.welcomeKitItem.create({
      data: {
        nombre: validated.nombre.trim(),
        categoria: validated.categoria,
        cantidad: validated.cantidad,
        stockMinimo: validated.stockMinimo,
        sedeId,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear artículo de Kit/EPP');
  }
}
