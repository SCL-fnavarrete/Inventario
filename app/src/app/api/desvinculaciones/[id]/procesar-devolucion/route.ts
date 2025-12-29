import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { registerReturnSchema } from "@/lib/validations/termination";

// POST /api/desvinculaciones/[id]/procesar-devolucion - Procesar devolución de equipos
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const validationResult = registerReturnSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que existe la desvinculación
    const termination = await prisma.termination.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            assignments: {
              where: { activo: true },
              include: {
                asset: { include: { categoria: true } },
              },
            },
          },
        },
      },
    });

    if (!termination) {
      return NextResponse.json(
        { error: "Desvinculación no encontrada" },
        { status: 404 }
      );
    }

    // Procesar devolución en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Determinar si hay daños para calcular descuento
      const hayDanos =
        data.estadoNotebook === "danado" ||
        data.estadoCelular === "danado" ||
        data.estadoMonitor === "danado";

      // Actualizar la desvinculación
      const updatedTermination = await tx.termination.update({
        where: { id },
        data: {
          fechaDevolucionEquipos: data.fechaDevolucionEquipos,
          estadoNotebook: data.estadoNotebook,
          estadoCelular: data.estadoCelular,
          estadoMonitor: data.estadoMonitor,
          estadoKit: data.estadoKit,
          recibidoPor: data.recibidoPor,
          lugarDevolucion: data.lugarDevolucion,
          requiereDescuento: data.requiereDescuento || hayDanos,
          montoDescuento: data.montoDescuento,
          motivoDescuento: data.motivoDescuento,
          observaciones: data.observaciones,
        },
      });

      // Procesar cada asignación activa
      for (const assignment of termination.employee.assignments) {
        const categoryName = assignment.asset.categoria.nombre.toLowerCase();
        let estadoDevolucion: "ok" | "danado" | "incompleto" = "ok";

        // Determinar estado según categoría
        if (categoryName === "notebook") {
          estadoDevolucion = data.estadoNotebook === "danado" ? "danado" : "ok";
        } else if (categoryName === "celular") {
          estadoDevolucion = data.estadoCelular === "danado" ? "danado" : "ok";
        } else if (categoryName === "monitor") {
          estadoDevolucion = data.estadoMonitor === "danado" ? "danado" : "ok";
        }

        // Cerrar asignación
        await tx.assignment.update({
          where: { id: assignment.id },
          data: {
            activo: false,
            fechaDevolucion: data.fechaDevolucionEquipos,
            recibidoPor: data.recibidoPor,
            estadoDevolucion,
            observacionesDevolucion: `Devolución por desvinculación. ${data.observaciones || ""}`.trim(),
          },
        });

        // Determinar nuevo estado del activo
        let nuevoEstadoActivo: "disponible" | "reutilizable" | "baja" = "reutilizable";
        if (estadoDevolucion === "danado") {
          nuevoEstadoActivo = "baja";
        }

        // Actualizar activo
        await tx.asset.update({
          where: { id: assignment.asset.id },
          data: {
            estado: nuevoEstadoActivo,
            condicion: estadoDevolucion === "danado" ? "danado" : "usado",
            empleadoActualId: null,
          },
        });

        // Registrar en historial
        await tx.assetHistory.create({
          data: {
            assetId: assignment.asset.id,
            tipoEvento: "devolucion",
            descripcion: `Devuelto por desvinculación de ${termination.employee.nombres} ${termination.employee.apellidoPaterno}. Estado: ${estadoDevolucion}`,
            datosAnteriores: {
              estado: assignment.asset.estado,
              empleadoActualId: assignment.asset.empleadoActualId,
            },
            datosNuevos: {
              estado: nuevoEstadoActivo,
              empleadoActualId: null,
            },
            usuarioSistema: data.recibidoPor,
          },
        });
      }

      return updatedTermination;
    });

    // Recargar con todas las relaciones
    const finalTermination = await prisma.termination.findUnique({
      where: { id },
      include: {
        employee: {
          include: {
            assignments: {
              include: {
                asset: { include: { categoria: true } },
              },
              orderBy: { fechaEntrega: "desc" },
            },
          },
        },
      },
    });

    return NextResponse.json(finalTermination);
  } catch (error) {
    console.error("Error processing return:", error);
    return NextResponse.json(
      { error: "Error al procesar devolución" },
      { status: 500 }
    );
  }
}
