import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { completeMaintenanceSchema } from "@/lib/validations/maintenance";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// POST /api/mantenciones/[id]/completar - Completar mantención
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('mantenciones', 'write');
    const { id } = await params;
    const body = await request.json();

    const validationResult = completeMaintenanceSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que existe la mantención
    const maintenance = await prisma.maintenance.findUnique({
      where: { id },
      include: {
        asset: true,
      },
    });

    if (!maintenance) {
      return NextResponse.json(
        { error: "Mantención no encontrada" },
        { status: 404 }
      );
    }

    // Verificar que no está ya completada o cancelada
    if (maintenance.estado === "completada") {
      return NextResponse.json(
        { error: "La mantención ya está completada" },
        { status: 400 }
      );
    }

    if (maintenance.estado === "cancelada") {
      return NextResponse.json(
        { error: "No se puede completar una mantención cancelada" },
        { status: 400 }
      );
    }

    // Completar en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Actualizar mantención
      const updatedMaintenance = await tx.maintenance.update({
        where: { id },
        data: {
          estado: "completada",
          fechaRealizada: data.fechaRealizada,
          realizadoPor: data.realizadoPor,
          resultado: data.resultado,
          costo: data.costo,
          proximaMantencion: data.proximaMantencion,
        },
        include: {
          asset: {
            include: { categoria: true },
          },
        },
      });

      // Actualizar estado del activo
      // Si el activo estaba asignado, volver a asignado
      // Si no, dejarlo disponible o reutilizable
      let nuevoEstado: "disponible" | "asignado" | "reutilizable" = "disponible";

      if (maintenance.asset.empleadoActualId) {
        nuevoEstado = "asignado";
      } else if (maintenance.asset.condicion === "usado") {
        nuevoEstado = "reutilizable";
      }

      await tx.asset.update({
        where: { id: maintenance.assetId },
        data: { estado: nuevoEstado },
      });

      // Registrar en historial
      await tx.assetHistory.create({
        data: {
          assetId: maintenance.assetId,
          tipoEvento: "mantencion",
          descripcion: `Mantención ${maintenance.tipo} completada. Resultado: ${data.resultado}`,
          datosAnteriores: { estado: "en_mantencion" },
          datosNuevos: {
            estado: nuevoEstado,
            maintenanceId: id,
            resultado: data.resultado,
            costo: data.costo,
          },
          usuarioSistema: data.realizadoPor,
        },
      });

      // Si hay próxima mantención programada, crear registro
      if (data.proximaMantencion) {
        await tx.maintenance.create({
          data: {
            assetId: maintenance.assetId,
            tipo: maintenance.tipo,
            descripcion: `Mantención programada (siguiente de #${id.slice(0, 8)})`,
            fechaProgramada: data.proximaMantencion,
            estado: "pendiente",
          },
        });
      }

      return updatedMaintenance;
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, 'Error al completar mantención');
  }
}
