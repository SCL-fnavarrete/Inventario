import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { returnAssignmentSchema } from "@/lib/validations/assignment";
import { executeReturn } from "@/lib/services/workflowExecutionService";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

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
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Una devolucion anterior a la entrega no es un dato raro: es un dato
    // imposible. El schema valida cada fecha por separado; la relacion entre
    // las dos solo se puede comprobar aqui, que es donde se conoce la entrega.
    if (data.fechaDevolucion < existingAssignment.fechaEntrega) {
      return NextResponse.json(
        {
          error: `La fecha de devolución no puede ser anterior a la de entrega (${existingAssignment.fechaEntrega.toLocaleDateString("es-CL")})`,
        },
        { status: 400 }
      );
    }

    // La devolucion vive en executeReturn, la misma funcion que usa el flujo de
    // solicitudes. Antes esta ruta tenia su propia copia y las dos ya habian
    // divergido: esta comprobaba que la asignacion siguiera activa y la otra
    // no, y esta escribia en el historial que el estado anterior era
    // "asignado" sin mirar cual era en realidad. El destino del activo
    // (SPEC 2.7.7: danado -> baja, el resto -> reutilizable) tambien se decide
    // ahora en un solo lugar.
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

      // Restaurar estado del activo
      await tx.asset.update({
        where: { id: assignment.assetId },
        data: {
          estado: "disponible",
          empleadoActualId: null,
        },
      });

      // Registrar en historial
      await tx.assetHistory.create({
        data: {
          assetId: assignment.assetId,
          tipoEvento: "cambio_estado",
          descripcion: `Asignación cancelada. Equipo devuelto a disponible.`,
          datosAnteriores: {
            estado: "asignado",
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
