import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { auditLogService } from '@/lib/services/auditLogService';
import { categoriaSchema } from '@/lib/validations/categoria';
import { exigirNombreCategoriaLibre, snapshotCategoria } from '@/lib/queries/categorias';

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
    const session = await requirePermission('categorias', 'write');
    const datos = categoriaSchema.parse(await request.json());
    await exigirNombreCategoriaLibre(datos.nombre);

    const category = await prisma.assetCategory.create({
      data: {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        stockMinimo: datos.stockMinimo ?? 3,
        tipoFicha: datos.tipoFicha ?? "generico",
      },
    });

    await auditLogService.registrarCreacion(
      'categoria',
      category.id,
      `Categoría creada: ${category.nombre}`,
      snapshotCategoria(category),
      session.user?.email
    );

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear categoría');
  }
}
