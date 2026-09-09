import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { createKitItemSchema } from '@/lib/validations/kitItem';

// GET /api/kit-items?categoria=kit_bienvenida|epp
// Catalogo de articulos de Kit de Bienvenida y EPP, con su stock actual.
// Separado de /api/activos a proposito: Kit/EPP no son equipos (ver
// prisma/schema.prisma, modelo WelcomeKitItem).
export async function GET(request: NextRequest) {
  try {
    await requirePermission('categorias', 'read');

    const categoria = request.nextUrl.searchParams.get('categoria');

    const items = await prisma.welcomeKitItem.findMany({
      where: categoria ? { categoria: categoria as 'kit_bienvenida' | 'epp' } : undefined,
      orderBy: { nombre: 'asc' },
    });

    return NextResponse.json(items);
  } catch (error) {
    return handleApiError(error, 'Error al obtener artículos de Kit/EPP');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission('categorias', 'write');

    const body = await request.json();
    const validated = createKitItemSchema.parse(body);

    const existing = await prisma.welcomeKitItem.findFirst({
      where: { nombre: { equals: validated.nombre, mode: 'insensitive' }, categoria: validated.categoria },
    });
    if (existing) {
      return NextResponse.json(
        { error: 'Ya existe un artículo con ese nombre en esta categoría' },
        { status: 400 }
      );
    }

    const item = await prisma.welcomeKitItem.create({
      data: {
        nombre: validated.nombre.trim(),
        categoria: validated.categoria,
        cantidad: validated.cantidad,
      },
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear artículo de Kit/EPP');
  }
}
