import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { returnAssignmentSchema } from "@/modules/asignaciones/validaciones";
import { executeReturn } from "@/modules/solicitudes/ejecucion";
import { cambiarEstado } from "@/modules/activos/servicio";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { formatearFecha } from "@/shared/utilidades/fechas";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/asignaciones/[id] - Obtener asignación por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('asignaciones', 'read');
    const { id } = await params;

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        asset: {
          include: {
            categoria: true,
            history: {
              orderBy: { createdAt: "desc" },
              take: 10,
            },
          },
        },
        employee: true,
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Asignación no encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(assignment);
  } catch (error) {
    return handleApiError(error, 'Error al obtener asignación');
  }
}

// PUT /api/asignaciones/[id] - Registrar devolución
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('asignaciones', 'write');
    const { id } = await params;
    const body = await request.json();

    // Verificar que la asignación existe y está activa
    const existingAssignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        asset: true,
        employee: true,
      },
    });

    if (!existingAssignment) {
      return NextResponse.json(
        { error: "Asignación no encontrada" },
        { status: 404 }
      );
    }

    if (!existingAssignment.activo) {
      return NextResponse.json(
        { error: "Esta asignación ya fue devuelta" },
        { status: 400 }
      );
    }

    // Validar datos de devolución
    const validationResult = returnAssignmentSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // La fecha de devolucion no puede ser anterior a la de entrega; se omite
    // la validacion si fechaEntrega es null (dato desconocido / import historico).
    if (existingAssignment.fechaEntrega && data.fechaDevolucion < existingAssignment.fechaEntrega) {
      return NextResponse.json(
        {
          error: `La fecha de devolución no puede ser anterior a la de entrega (${formatearFecha(existingAssignment.fechaEntrega)})`,
        },
        { status: 400 }
      );
    }

    // executeReturn centraliza la logica de devolucion (compartida con el
    // flujo de solicitudes), incluyendo a que estado pasa el activo.
    const result = await prisma.$transaction((tx) =>
      executeReturn(tx, {
        assignmentId: id,
        fechaDevolucion: data.fechaDevolucion,
        recibidoPor: data.recibidoPor,
        estadoDevolucion: data.estadoDevolucion,
        observacionesDevolucion: data.observacionesDevolucion,
      })
    );

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al registrar devolución');
  }
}

// DELETE /api/asignaciones/[id] - Cancelar asignación (solo si no ha sido devuelta)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('asignaciones', 'delete');
    const { id } = await params;

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        asset: true,
        employee: true,
      },
    });

    if (!assignment) {
      return NextResponse.json(
        { error: "Asignación no encontrada" },
        { status: 404 }
      );
    }

    if (!assignment.activo) {
      return NextResponse.json(
        { error: "No se puede cancelar una asignación ya devuelta" },
        { status: 400 }
      );
    }

    // Cancelar asignación y restaurar activo en una transacción
    await prisma.$transaction(async (tx) => {
      // Eliminar asignación
      await tx.assignment.delete({
        where: { id },
      });

      // Restaurar estado del activo, con su historial.
      await cambiarEstado(tx, {
        activo: assignment.asset,
        a: "disponible",
        contexto: { motivo: "Asignación cancelada" },
        datos: { empleadoActualId: null },
        historial: {
          tipoEvento: "cambio_estado",
          descripcion: `Asignación cancelada. Equipo devuelto a disponible.`,
          datosAnteriores: {
            estado: assignment.asset.estado,
            empleadoActualId: assignment.employeeId,
          },
          datosNuevos: {
            estado: "disponible",
            empleadoActualId: null,
          },
          usuarioSistema: "Sistema",
        },
      });
    });

    return NextResponse.json({ message: "Asignación cancelada correctamente" });
  } catch (error) {
    return handleApiError(error, 'Error al cancelar asignación');
  }
}
