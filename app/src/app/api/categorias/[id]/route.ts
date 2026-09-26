import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, NotFoundError, ConflictError } from '@/lib/auth/guard';
import { auditLogService } from '@/lib/services/auditLogService';
import { categoriaSchema } from '@/lib/validations/categoria';
import { exigirNombreCategoriaLibre, snapshotCategoria } from '@/lib/queries/categorias';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('categorias', 'read');
    const { id } = await params;

    const category = await prisma.assetCategory.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!category) throw new NotFoundError("Categoría no encontrada");

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
    const session = await requirePermission('categorias', 'write');
    const { id } = await params;
    const datos = categoriaSchema.parse(await request.json());

    const existing = await prisma.assetCategory.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Categoría no encontrada");
    await exigirNombreCategoriaLibre(datos.nombre, id);

    const category = await prisma.assetCategory.update({
      where: { id },
      data: {
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        stockMinimo: datos.stockMinimo ?? existing.stockMinimo,
        tipoFicha: datos.tipoFicha ?? existing.tipoFicha,
      },
    });

    // Todo lo que cambia queda en la auditoria, tambien "Que campos pide"
    // (SPEC 2.112.7).
    await auditLogService.registrarActualizacion(
      'categoria',
      category.id,
      `Categoría actualizada: ${category.nombre}`,
      snapshotCategoria(existing),
      snapshotCategoria(category),
      session.user?.email
    );

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
    const session = await requirePermission('categorias', 'delete');
    const { id } = await params;

    const existing = await prisma.assetCategory.findUnique({
      where: { id },
      include: { _count: { select: { assets: true } } },
    });
    if (!existing) throw new NotFoundError("Categoría no encontrada");

    // Una categoria con activos no se elimina: esos activos quedarian sin
    // categoria (409, regla de negocio).
    if (existing._count.assets > 0) {
      throw new ConflictError(
        `No se puede eliminar: la categoría tiene ${existing._count.assets} activo(s). Cambia su categoría primero.`
      );
    }

    await prisma.assetCategory.delete({ where: { id } });

    await auditLogService.registrarEliminacion(
      'categoria',
      existing.id,
      `Categoría eliminada: ${existing.nombre}`,
      snapshotCategoria(existing),
      session.user?.email
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar categoría');
  }
}
