import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError, NotFoundError } from '@/lib/auth/guard';
import { auditLogService } from '@/lib/services/auditLogService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH /api/sedes/[id] - Editar nombre o activar/desactivar una sede
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('sedes', 'write');
    const { id } = await params;
    const body = await request.json();

    const existente = await prisma.sede.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundError('Sede no encontrada');
    }

    const sede = await prisma.sede.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined && { nombre: body.nombre.trim() }),
        // El codigo NO se permite editar aqui a proposito: es la referencia
        // estable que ya pueden estar usando integraciones/reportes. Si de
        // verdad hay que corregirlo, se hace directo en la base.
        ...(body.activa !== undefined && { activa: !!body.activa }),
      },
    });

    // Auditoria generica (SPEC 2.31).
    await auditLogService.registrarActualizacion(
      'sede',
      sede.id,
      `Sede actualizada: ${sede.nombre} (${sede.codigo})`,
      { nombre: existente.nombre, activa: existente.activa },
      { nombre: sede.nombre, activa: sede.activa },
      session.user?.email
    );

    return NextResponse.json(sede);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar sede');
  }
}
