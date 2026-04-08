import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { returnAssignmentSchema } from "@/lib/validations/assignment";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/asignaciones/[id] - Obtener asignación por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
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
    console.error("Error fetching assignment:", error);
    return NextResponse.json(
      { error: "Error al obtener asignación" },
      { status: 500 }
    );
  }
}

// PUT /api/asignaciones/[id] - Registrar devolución
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
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

    // SPEC 2.7.7: Destino automático del activo según estado de devolución
    let nuevoEstadoActivo: "reutilizable" | "baja" = "reutilizable";
    if (data.estadoDevolucion === "danado") {
      nuevoEstadoActivo = "baja"; // SPEC: danado → baja
    }
    // ok → reutilizable, incompleto → reutilizable

    // Actualizar asignación y activo en una transacción
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar asignación
      const assignment = await tx.assignment.update({
        where: { id },
        data: {
          fechaDevolucion: data.fechaDevolucion,
          recibidoPor: data.recibidoPor,
          estadoDevolucion: data.estadoDevolucion,
          observacionesDevolucion: data.observacionesDevolucion,
          activo: false,
        },
        include: {
          asset: {
            include: { categoria: true },
          },
          employee: true,
        },
      });

      // Actualizar estado del activo (SPEC 2.7.7)
      await tx.asset.update({
        where: { id: existingAssignment.assetId },
        data: {
          estado: nuevoEstadoActivo,
          condicion: data.estadoDevolucion === "danado" ? "danado" : "usado",
          empleadoActualId: null,
          ...(nuevoEstadoActivo === "baja" && { fechaBaja: new Date() }),
        },
      });

      // Registrar en historial
      await tx.assetHistory.create({
        data: {
          assetId: existingAssignment.assetId,
          tipoEvento: "devolucion",
          descripcion: `Devuelto por ${existingAssignment.employee.nombres} ${existingAssignment.employee.apellidoPaterno}. Estado: ${data.estadoDevolucion}`,
          datosAnteriores: {
            estado: "asignado",
            empleadoActualId: existingAssignment.employeeId,
          },
          datosNuevos: {
            estado: nuevoEstadoActivo,
            empleadoActualId: null,
            estadoDevolucion: data.estadoDevolucion,
          },
          usuarioSistema: data.recibidoPor || "Sistema",
        },
      });

      return assignment;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error updating assignment:", error);
    return NextResponse.json(
      { error: "Error al registrar devolución" },
      { status: 500 }
    );
  }
}

// DELETE /api/asignaciones/[id] - Cancelar asignación (solo si no ha sido devuelta)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
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
    console.error("Error deleting assignment:", error);
    return NextResponse.json(
      { error: "Error al cancelar asignación" },
      { status: 500 }
    );
  }
}
