import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';
import { updateKitItemSchema } from '@/lib/validations/kitItem';
import { auditLogService } from '@/lib/services/auditLogService';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('kitEpp', 'write');
    const { id } = await params;

    const body = await request.json();
    const validated = updateKitItemSchema.parse(body);

    const item = await prisma.welcomeKitItem.findUnique({ where: { id } });
    if (!item) {
      return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 });
    }
    assertSedeAccess(session, item.sedeId, 'Artículo no encontrado');

    const updated = await prisma.welcomeKitItem.update({
      where: { id },
      data: {
        ...(validated.nombre !== undefined && { nombre: validated.nombre.trim() }),
        ...(validated.categoria !== undefined && { categoria: validated.categoria }),
        ...(validated.cantidad !== undefined && { cantidad: validated.cantidad }),
        ...(validated.stockMinimo !== undefined && { stockMinimo: validated.stockMinimo }),
      },
    });

    // Auditoria generica (SPEC 2.31).
    await auditLogService.registrarActualizacion(
      'kit_item',
      updated.id,
      `Artículo de Kit/EPP actualizado: ${updated.nombre}`,
      { nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad },
      { nombre: updated.nombre, categoria: updated.categoria, cantidad: updated.cantidad },
      session.user?.email
    );

    return NextResponse.json(updated);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar artículo de Kit/EPP');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('kitEpp', 'delete');
    const { id } = await params;

    const item = await prisma.welcomeKitItem.findUnique({
      where: { id },
      include: { _count: { select: { kitAssignments: true } } },
    });
    if (!item) {
      return NextResponse.json({ error: 'Artículo no encontrado' }, { status: 404 });
    }
    assertSedeAccess(session, item.sedeId, 'Artículo no encontrado');
    if (item._count.kitAssignments > 0) {
      return NextResponse.json(
        { error: 'No se puede eliminar: este artículo ya tiene entregas registradas. Puedes dejar la cantidad en 0 en vez de eliminarlo.' },
        { status: 400 }
      );
    }

    await prisma.welcomeKitItem.delete({ where: { id } });

    // Auditoria generica (SPEC 2.31).
    await auditLogService.registrarEliminacion(
      'kit_item',
      item.id,
      `Artículo de Kit/EPP eliminado: ${item.nombre}`,
      { nombre: item.nombre, categoria: item.categoria, sedeId: item.sedeId },
      session.user?.email
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar artículo de Kit/EPP');
  }
}
