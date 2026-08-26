import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('categorias', 'read');

    const searchParams = request.nextUrl.searchParams;
    const includeCount = searchParams.get("includeCount") === "true";

    const categories = await prisma.assetCategory.findMany({
      orderBy: { nombre: "asc" },
      ...(includeCount && {
        include: {
          _count: {
            select: { assets: true },
          },
        },
      }),
    });

    return NextResponse.json(categories);
  } catch (error) {
    return handleApiError(error, 'Error al obtener categorías');
  }
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission('categorias', 'write');

    const body = await request.json();
    const { nombre, descripcion, requiereSerie, requiereImei } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    // Verificar si ya existe
    const existing = await prisma.assetCategory.findFirst({
      where: { nombre: { equals: nombre, mode: "insensitive" } },
    });

    if (existing) {
      return NextResponse.json(
        { error: "Ya existe una categoría con ese nombre" },
        { status: 400 }
      );
    }

    const category = await prisma.assetCategory.create({
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        requiereSerie: requiereSerie ?? true,
        requiereImei: requiereImei ?? false,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear categoría');
  }
}
