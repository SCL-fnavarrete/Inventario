import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { updateAssetSchema } from "@/lib/validations/asset";
import { assetHistoryService } from "@/lib/services/assetHistoryService";
import { validateTransition } from "@/lib/services/assetStateMachine";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('activos', 'read');

    const { id } = await params;

    const asset = await prisma.asset.findUnique({
      where: { id },
      include: {
        categoria: true,
        empleadoActual: {
          select: { nombres: true, apellidoPaterno: true, rut: true },
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al obtener activo');
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requirePermission('activos', 'write');

    const { id } = await params;
    const body = await request.json();

    // Validar datos con Zod
    const validatedData = updateAssetSchema.parse(body);

    // Verificar que el activo existe
    const existingAsset = await prisma.asset.findUnique({
      where: { id },
      include: { categoria: true },
    });

    if (!existingAsset) {
      return NextResponse.json(
        { error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    // Verificar si el número de serie ya existe (si se cambió y se proporciona)
    if (validatedData.numeroSerie && validatedData.numeroSerie !== existingAsset.numeroSerie) {
      const duplicateSerie = await prisma.asset.findUnique({
        where: { numeroSerie: validatedData.numeroSerie },
      });

      if (duplicateSerie) {
        return NextResponse.json(
          { error: "Ya existe un activo con este numero de serie" },
          { status: 400 }
        );
      }
    }

    const usuario = session.user?.email || "sistema";

    // Validar transición de estado con la máquina de estados (SPEC 2.7)
    if (validatedData.estado && validatedData.estado !== existingAsset.estado) {
      const activeAssignment = await prisma.assignment.findFirst({
        where: { assetId: id, activo: true },
      });
      const activeMaintenance = await prisma.maintenance.findFirst({
        where: { assetId: id, estado: { in: ['pendiente', 'en_proceso'] } },
      });

      const transitionResult = validateTransition(
        existingAsset.estado,
        validatedData.estado,
        {
          hasActiveAssignment: !!activeAssignment,
          hasActiveMaintenance: !!activeMaintenance,
        }
      );

      if (!transitionResult.valid) {
        return NextResponse.json(
          { error: "Transición de estado no permitida", details: transitionResult.errors },
          { status: 400 }
        );
      }

      await assetHistoryService.registrarCambioEstado(
        id,
        existingAsset.estado,
        validatedData.estado,
        undefined,
        usuario
      );
    }

    // Registrar cambios en especificaciones técnicas
    const specsFields = ['procesador', 'ram', 'discoDuro', 'sistemaOperativo', 'pulgadas'] as const;
    const specsAnteriores: Record<string, unknown> = {};
    const specsNuevos: Record<string, unknown> = {};
    let hasSpecChanges = false;

    for (const field of specsFields) {
      if (validatedData[field] !== undefined && validatedData[field] !== existingAsset[field]) {
        specsAnteriores[field] = existingAsset[field];
        specsNuevos[field] = validatedData[field];
        hasSpecChanges = true;
      }
    }

    if (hasSpecChanges) {
      await assetHistoryService.registrarActualizacionSpecs(
        id,
        specsAnteriores as Prisma.InputJsonValue,
        specsNuevos as Prisma.InputJsonValue,
        usuario
      );
    }

    // Helper para convertir pulgadas a número o null
    const parsePulgadas = (value: string | number | null | undefined): number | null => {
      if (value === undefined || value === null || value === "") return null;
      const num = typeof value === "number" ? value : parseFloat(value);
      return isNaN(num) ? null : num;
    };

    // Actualizar activo
    const asset = await prisma.asset.update({
      where: { id },
      data: {
        ...(validatedData.categoriaId && { categoriaId: validatedData.categoriaId }),
        ...(validatedData.marca && { marca: validatedData.marca }),
        ...(validatedData.modelo && { modelo: validatedData.modelo }),
        ...(validatedData.numeroSerie !== undefined && { numeroSerie: validatedData.numeroSerie || null }),
        ...(validatedData.numeroActivoInterno !== undefined && { numeroActivoInterno: validatedData.numeroActivoInterno || null }),
        ...(validatedData.estado && { estado: validatedData.estado }),
        ...(validatedData.condicion && { condicion: validatedData.condicion }),
        ...(validatedData.fechaCompra !== undefined && { fechaCompra: validatedData.fechaCompra ? new Date(validatedData.fechaCompra) : null }),
        ...(validatedData.fechaGarantiaFin !== undefined && { fechaGarantiaFin: validatedData.fechaGarantiaFin ? new Date(validatedData.fechaGarantiaFin) : null }),
        ...(validatedData.fechaBaja !== undefined && { fechaBaja: validatedData.fechaBaja ? new Date(validatedData.fechaBaja) : null }),
        ...(validatedData.procesador !== undefined && { procesador: validatedData.procesador || null }),
        ...(validatedData.ram !== undefined && { ram: validatedData.ram || null }),
        ...(validatedData.discoDuro !== undefined && { discoDuro: validatedData.discoDuro || null }),
        ...(validatedData.sistemaOperativo !== undefined && { sistemaOperativo: validatedData.sistemaOperativo || null }),
        ...(validatedData.imei !== undefined && { imei: validatedData.imei || null }),
        ...(validatedData.numeroTelefono !== undefined && { numeroTelefono: validatedData.numeroTelefono || null }),
        ...(validatedData.numeroActivacion !== undefined && { numeroActivacion: validatedData.numeroActivacion || null }),
        ...(validatedData.tipoPlan !== undefined && { tipoPlan: validatedData.tipoPlan || null }),
        ...(validatedData.tieneCargador !== undefined && { tieneCargador: validatedData.tieneCargador }),
        ...(validatedData.pulgadas !== undefined && { pulgadas: parsePulgadas(validatedData.pulgadas) }),
        ...(validatedData.ubicacionFisica !== undefined && { ubicacionFisica: validatedData.ubicacionFisica || null }),
        ...(validatedData.microsoft365 !== undefined && { microsoft365: validatedData.microsoft365 }),
        ...(validatedData.intuneEnrolled !== undefined && { intuneEnrolled: validatedData.intuneEnrolled }),
        ...(validatedData.listaDistribucion !== undefined && { listaDistribucion: validatedData.listaDistribucion || null }),
        ...(validatedData.observaciones !== undefined && { observaciones: validatedData.observaciones || null }),
        ...(validatedData.operador !== undefined && { operador: validatedData.operador || null }),
        ...(validatedData.antivirus !== undefined && { antivirus: validatedData.antivirus || null }),
        ...(validatedData.incidencia !== undefined && { incidencia: validatedData.incidencia || null }),
        ...(validatedData.nombreEquipo !== undefined && { nombreEquipo: validatedData.nombreEquipo || null }),
      },
    });

    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar activo');
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requirePermission('activos', 'delete');

    const { id } = await params;

    // Verificar que el activo existe
    const existingAsset = await prisma.asset.findUnique({
      where: { id },
    });

    if (!existingAsset) {
      return NextResponse.json(
        { error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    // Eliminar historial primero
    await prisma.assetHistory.deleteMany({
      where: { assetId: id },
    });

    // Eliminar asignaciones
    await prisma.assignment.deleteMany({
      where: { assetId: id },
    });

    // Eliminar activo
    await prisma.asset.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar activo');
  }
}
