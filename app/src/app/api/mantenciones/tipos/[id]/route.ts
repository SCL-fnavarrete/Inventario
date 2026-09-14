import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { updateMaintenanceTypeSchema } from '@/lib/validations/maintenanceType';
import { auditLogService } from '@/lib/services/auditLogService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PUT /api/mantenciones/tipos/[id] - Actualizar (o desactivar) un tipo
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('tiposMantencion', 'write');

    const { id } = await params;
    const body = await request.json();
    const validationResult = updateMaintenanceTypeSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: 'Datos inválidos', details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    const existing = await prisma.maintenanceType.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Tipo de mantención no encontrado' }, { status: 404 });
    }

    if (data.nombre) {
      const duplicate = await prisma.maintenanceType.findFirst({
        where: { nombre: { equals: data.nombre.trim(), mode: 'insensitive' }, NOT: { id } },
      });
      if (duplicate) {
        return NextResponse.json(
          { error: 'Ya existe un tipo de mantención con ese nombre' },
          { status: 400 }
        );
      }
    }

    const tipo = await prisma.maintenanceType.update({
      where: { id },
      data: {
        nombre: data.nombre?.trim() ?? existing.nombre,
        descripcion:
          data.descripcion !== undefined ? data.descripcion?.trim() || null : existing.descripcion,
        activo: data.activo ?? existing.activo,
      },
    });

    // Auditoria generica (SPEC 2.31).
    await auditLogService.registrarActualizacion(
      'tipo_mantencion',
      tipo.id,
      `Tipo de mantención actualizado: ${tipo.nombre}`,
      { nombre: existing.nombre, descripcion: existing.descripcion, activo: existing.activo },
      { nombre: tipo.nombre, descripcion: tipo.descripcion, activo: tipo.activo },
      session.user?.email
    );

    return NextResponse.json(tipo);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar tipo de mantención');
  }
}

// DELETE /api/mantenciones/tipos/[id] - Eliminar un tipo
// Solo se puede borrar si ninguna mantencion lo usa (por la FK). Si esta
// en uso, se sugiere desactivarlo en vez de borrarlo (ver PUT, campo
// "activo") para no perder el tipo de mantenciones ya registradas.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('tiposMantencion', 'delete');

    const { id } = await params;

    const existing = await prisma.maintenanceType.findUnique({
      where: { id },
      include: { _count: { select: { maintenances: true } } },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Tipo de mantención no encontrado' }, { status: 404 });
    }

    if (existing._count.maintenances > 0) {
      return NextResponse.json(
        {
          error:
            'No se puede eliminar: hay mantenciones que usan este tipo. Puedes desactivarlo en vez de eliminarlo.',
        },
        { status: 400 }
      );
    }

    await prisma.maintenanceType.delete({ where: { id } });

    // Auditoria generica (SPEC 2.31).
    await auditLogService.registrarEliminacion(
      'tipo_mantencion',
      existing.id,
      `Tipo de mantención eliminado: ${existing.nombre}`,
      { nombre: existing.nombre, descripcion: existing.descripcion },
      session.user?.email
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar tipo de mantención');
  }
}
