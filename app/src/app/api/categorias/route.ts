import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Error al obtener categorías" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "Error al crear categoría" },
      { status: 500 }
    );
  }
}
