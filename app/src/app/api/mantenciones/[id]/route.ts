import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateMaintenanceSchema, completeMaintenanceSchema } from "@/lib/validations/maintenance";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { assertSedeAccess } from '@/lib/auth/sedeScope';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/mantenciones/[id] - Obtener detalle de mantención
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'read');
    const { id } = await params;

    const maintenance = await prisma.maintenance.findUnique({
      where: { id },
      include: {
        tipo: true,
        asset: {
          include: {
            categoria: true,
            empleadoActual: {
              select: {
                id: true,
                rut: true,
                nombres: true,
                apellidoPaterno: true,
                apellidoMaterno: true,
                correoPersonal: true,
                cargo: true,
              },
            },
          },
        },
      },
    });

    if (!maintenance) {
      return NextResponse.json(
        { error: "Mantención no encontrada" },
        { status: 404 }
      );
    }

    // Maintenance no tiene sedeId propio -- se valida via la sede del activo.
    assertSedeAccess(session, maintenance.asset.sedeId, 'Mantención no encontrada');

    return NextResponse.json(maintenance);
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantención');
  }
}

// PUT /api/mantenciones/[id] - Actualizar mantención
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = updateMaintenanceSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que existe la mantención
    const existingMaintenance = await prisma.maintenance.findUnique({
      where: { id },
      include: {
        asset: true,
      },
    });

    if (!existingMaintenance) {
      return NextResponse.json(
        { error: "Mantención no encontrada" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, existingMaintenance.asset.sedeId, 'Mantención no encontrada');

    // No permitir modificar mantenciones completadas o canceladas
    if (existingMaintenance.estado === "completada" || existingMaintenance.estado === "cancelada") {
      return NextResponse.json(
        { error: "No se puede modificar una mantención completada o cancelada" },
        { status: 400 }
      );
    }

    // Actualizar en transacción
    const result = await prisma.$transaction(async (tx) => {
      const updatedMaintenance = await tx.maintenance.update({
        where: { id },
        data: {
          tipoId: data.tipoId,
          descripcion: data.descripcion,
          fechaProgramada: data.fechaProgramada,
          fechaRealizada: data.fechaRealizada,
          proximaMantencion: data.proximaMantencion,
          realizadoPor: data.realizadoPor,
          costo: data.costo,
          proveedorExterno: data.proveedorExterno,
          estado: data.estado,
          resultado: data.resultado,
        },
        include: {
          tipo: true,
          asset: {
            include: { categoria: true },
          },
        },
      });

      // Si se completa la mantención, actualizar estado del activo
      if (data.estado === "completada" && existingMaintenance.estado !== "completada") {
        // Determinar nuevo estado del activo
        const nuevoEstado = existingMaintenance.asset.condicion === "danado"
          ? "reutilizable"
          : "disponible";

        await tx.asset.update({
          where: { id: existingMaintenance.assetId },
          data: { estado: nuevoEstado },
        });

        // Registrar en historial
        await tx.assetHistory.create({
          data: {
            assetId: existingMaintenance.assetId,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${updatedMaintenance.tipo.nombre} completada: ${data.resultado || "Sin observaciones"}`,
            datosAnteriores: { estado: "en_mantencion" },
            datosNuevos: { estado: nuevoEstado, maintenanceId: id },
            usuarioSistema: data.realizadoPor || "Sistema",
          },
        });
      }

      // Si se cancela, restaurar estado del activo
      if (data.estado === "cancelada" && existingMaintenance.estado !== "cancelada") {
        const estadoAnterior = existingMaintenance.asset.empleadoActualId
          ? "asignado"
          : "disponible";

        await tx.asset.update({
          where: { id: existingMaintenance.assetId },
          data: { estado: estadoAnterior },
        });

        // Registrar en historial
        await tx.assetHistory.create({
          data: {
            assetId: existingMaintenance.assetId,
            tipoEvento: "mantencion",
            descripcion: `Mantención ${updatedMaintenance.tipo.nombre} cancelada`,
            datosAnteriores: { estado: "en_mantencion" },
            datosNuevos: { estado: estadoAnterior, maintenanceId: id },
            usuarioSistema: data.realizadoPor || "Sistema",
          },
        });
      }

      return updatedMaintenance;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar mantención');
  }
}

// DELETE /api/mantenciones/[id] - Eliminar mantención
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('mantenciones', 'delete');
    const { id } = await params;

    const maintenance = await prisma.maintenance.findUnique({
      where: { id },
      include: { asset: true },
    });

    if (!maintenance) {
      return NextResponse.json(
        { error: "Mantención no encontrada" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, maintenance.asset.sedeId, 'Mantención no encontrada');

    // Solo permitir eliminar mantenciones pendientes
    if (maintenance.estado !== "pendiente") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar mantenciones pendientes" },
        { status: 400 }
      );
    }

    // Eliminar en transacción
    await prisma.$transaction(async (tx) => {
      // Eliminar mantención
      await tx.maintenance.delete({ where: { id } });

      // Restaurar estado del activo si estaba en mantención
      if (maintenance.asset.estado === "en_mantencion") {
        const estadoAnterior = maintenance.asset.empleadoActualId
          ? "asignado"
          : "disponible";

        await tx.asset.update({
          where: { id: maintenance.assetId },
          data: { estado: estadoAnterior },
        });
      }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar mantención');
  }
}
