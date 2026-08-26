import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoGuia } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/guias-despacho/[id] - Obtener detalle de guía
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('guias', 'read');
    const { id } = await params;

    const guide = await prisma.dispatchGuide.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
        },
        destinatario: {
          select: {
            id: true,
            rut: true,
            nombres: true,
            apellidoPaterno: true,
            apellidoMaterno: true,
            cargo: true,
            ubicacion: true,
            correo: true,
          },
        },
      },
    });

    if (!guide) {
      return NextResponse.json(
        { error: "Guía de despacho no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(guide);
  } catch (error) {
    return handleApiError(error, 'Error al obtener guía de despacho');
  }
}

// PATCH /api/guias-despacho/[id] - Actualizar guía (estado, recepción, etc.)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('guias', 'write');
    const { id } = await params;
    const body = await request.json();
    const { estado, fechaRecepcion, recibidoPor, observaciones } = body;

    // Verificar que la guía existe
    const existingGuide = await prisma.dispatchGuide.findUnique({
      where: { id },
    });

    if (!existingGuide) {
      return NextResponse.json(
        { error: "Guía de despacho no encontrada" },
        { status: 404 }
      );
    }

    // Validar transiciones de estado
    if (estado) {
      if (!Object.values(EstadoGuia).includes(estado)) {
        return NextResponse.json(
          { error: "Estado inválido" },
          { status: 400 }
        );
      }

      // Reglas de transición de estado
      const validTransitions: Record<EstadoGuia, EstadoGuia[]> = {
        pendiente: [EstadoGuia.despachado, EstadoGuia.anulado],
        despachado: [EstadoGuia.recibido, EstadoGuia.anulado],
        recibido: [], // Estado final
        anulado: [], // Estado final
      };

      if (!validTransitions[existingGuide.estado].includes(estado)) {
        return NextResponse.json(
          { error: `No se puede cambiar de ${existingGuide.estado} a ${estado}` },
          { status: 400 }
        );
      }
    }

    // Preparar datos de actualización
    const updateData: Record<string, unknown> = {};

    if (estado) {
      updateData.estado = estado;
    }

    if (fechaRecepcion) {
      updateData.fechaRecepcion = new Date(fechaRecepcion);
    }

    if (recibidoPor !== undefined) {
      updateData.recibidoPor = recibidoPor;
    }

    if (observaciones !== undefined) {
      updateData.observaciones = observaciones;
    }

    // Actualizar
    const updatedGuide = await prisma.dispatchGuide.update({
      where: { id },
      data: updateData,
      include: {
        items: {
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
        },
        destinatario: true,
      },
    });

    return NextResponse.json(updatedGuide);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar guía de despacho');
  }
}

// DELETE /api/guias-despacho/[id] - Eliminar guía (solo si está pendiente)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('guias', 'delete');
    const { id } = await params;

    const guide = await prisma.dispatchGuide.findUnique({
      where: { id },
    });

    if (!guide) {
      return NextResponse.json(
        { error: "Guía de despacho no encontrada" },
        { status: 404 }
      );
    }

    // Solo permitir eliminar si está pendiente
    if (guide.estado !== EstadoGuia.pendiente) {
      return NextResponse.json(
        { error: "Solo se pueden eliminar guías en estado pendiente" },
        { status: 400 }
      );
    }

    await prisma.dispatchGuide.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Guía eliminada correctamente" });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar guía de despacho');
  }
}
