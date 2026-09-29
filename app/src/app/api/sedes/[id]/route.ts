import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { requirePermission, handleApiError, NotFoundError } from '@/shared/auth/guard';
import { auditLogService } from '@/shared/auditoria';
import { editarSedeSchema } from '@/modules/configuracion';
import { exigirNombreSedeLibre } from '@/shared/sedes/consultas';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// PATCH /api/sedes/[id] - Editar nombre o activar/desactivar una sede.
// Desactivarla deja fuera a sus tecnicos (shared/auth/opciones.ts, SPEC 2.112.6): no
// pueden iniciar sesion y los que estan dentro salen en su siguiente accion.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('sedes', 'write');
    const { id } = await params;
    const { nombre, activa } = editarSedeSchema.parse(await request.json());

    const existente = await prisma.sede.findUnique({ where: { id } });
    if (!existente) {
      throw new NotFoundError('Sede no encontrada');
    }
    if (nombre !== undefined) await exigirNombreSedeLibre(nombre, id);

    const sede = await prisma.sede.update({
      where: { id },
      data: {
        ...(nombre !== undefined && { nombre }),
        // El codigo NO se permite editar aqui a proposito: es la referencia
        // estable que ya pueden estar usando integraciones/reportes. Si de
        // verdad hay que corregirlo, se hace directo en la base.
        ...(activa !== undefined && { activa }),
      },
    });

    // Registro de auditoria.
    await auditLogService.registrarActualizacion(
      'sede',
      sede.id,
      existente.activa !== sede.activa
        ? `Sede ${sede.activa ? 'activada' : 'desactivada'}: ${sede.nombre} (${sede.codigo})`
        : `Sede actualizada: ${sede.nombre} (${sede.codigo})`,
      { nombre: existente.nombre, activa: existente.activa },
      { nombre: sede.nombre, activa: sede.activa },
      session.user?.email
    );

    return NextResponse.json(sede);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar sede');
  }
}
