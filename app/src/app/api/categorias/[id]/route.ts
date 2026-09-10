import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('categorias', 'read');

    const { id } = await params;

    const category = await prisma.assetCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoría no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(category);
  } catch (error) {
    return handleApiError(error, 'Error al obtener categoría');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('categorias', 'write');

    const { id } = await params;
    const body = await request.json();
    const { nombre, descripcion, requiereSerie, requiereImei, stockMinimo } = body;

    if (!nombre || !nombre.trim()) {
      return NextResponse.json(
        { error: "El nombre es requerido" },
        { status: 400 }
      );
    }

    // Verificar que existe
    const existing = await prisma.assetCategory.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Categoría no encontrada" },
        { status: 404 }
      );
    }

    // Verificar nombre duplicado (excepto la misma categoría)
    const duplicate = await prisma.assetCategory.findFirst({
      where: {
        nombre: { equals: nombre, mode: "insensitive" },
        NOT: { id },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "Ya existe una categoría con ese nombre" },
        { status: 400 }
      );
    }

    const category = await prisma.assetCategory.update({
      where: { id },
      data: {
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
        requiereSerie: requiereSerie ?? existing.requiereSerie,
        requiereImei: requiereImei ?? existing.requiereImei,
        stockMinimo: Number.isFinite(Number(stockMinimo)) ? Number(stockMinimo) : existing.stockMinimo,
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar categoría');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('categorias', 'delete');

    const { id } = await params;

    // Verificar que existe
    const existing = await prisma.assetCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { assets: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Categoría no encontrada" },
        { status: 404 }
      );
    }

    // No permitir eliminar si tiene activos
    if (existing._count.assets > 0) {
      return NextResponse.json(
        { error: "No se puede eliminar una categoría con activos asociados" },
        { status: 400 }
      );
    }

    await prisma.assetCategory.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar categoría');
  }
}
