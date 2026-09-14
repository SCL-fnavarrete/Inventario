import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkAssetsToPurchaseSchema } from "@/lib/validations/purchase";
import { z } from "zod";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { assetHistoryService } from '@/lib/services/assetHistoryService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id]/activos - Listar activos de una compra
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'read');

    const { id } = await params;

    // Verificar que la compra existe
    const purchase = await prisma.purchase.findUnique({
      where: { id },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');

    const purchaseAssets = await prisma.purchaseAsset.findMany({
      where: { purchaseId: id },
      include: {
        asset: {
          include: {
            categoria: true,
            empleadoActual: {
              select: {
                id: true,
                rut: true,
                nombres: true,
                apellidoPaterno: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      data: purchaseAssets,
      stats: {
        totalActivos: purchaseAssets.length,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener activos de la compra');
  }
}

// POST /api/compras/[id]/activos - Vincular activos a una compra
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');

    const { id } = await params;
    const body = await request.json();

    // Verificar que la compra existe
    const purchase = await prisma.purchase.findUnique({
      where: { id },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');
    const esAdmin = tieneVisibilidadTotal(session);

    const validationResult = linkAssetsToPurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    // Verificar que los activos existen
    const existingAssets = await prisma.asset.findMany({
      where: { ...ACTIVOS_VIGENTES, id: { in: data.assetIds } },
      select: { id: true, numeroSerie: true, sedeId: true },
    });

    const existingAssetIds = new Set(existingAssets.map((a) => a.id));
    const missingAssets = data.assetIds.filter((id) => !existingAssetIds.has(id));

    if (missingAssets.length > 0) {
      return NextResponse.json(
        { error: "Algunos activos no existen", missingAssets },
        { status: 404 }
      );
    }

    // Defensa en profundidad: un tecnico solo puede vincular activos de su
    // propia sede. Ver SPEC 2.9.
    if (!esAdmin) {
      const ajenos = existingAssets.filter((a) => a.sedeId !== session.user.sedeId);
      if (ajenos.length > 0) {
        return NextResponse.json(
          { error: "Algunos activos no pertenecen a tu sede" },
          { status: 400 }
        );
      }
    }

    // Verificar que los activos no estén ya vinculados a esta compra
    const alreadyLinked = await prisma.purchaseAsset.findMany({
      where: {
        purchaseId: id,
        assetId: { in: data.assetIds },
      },
      select: { assetId: true },
    });

    if (alreadyLinked.length > 0) {
      const linkedIds = alreadyLinked.map((a) => a.assetId);
      return NextResponse.json(
        {
          error: "Algunos activos ya están vinculados a esta compra",
          linkedAssetIds: linkedIds,
        },
        { status: 409 }
      );
    }

    // Vincular activos en transacción
    const result = await prisma.$transaction(async (tx) => {
      // Crear vínculos
      await tx.purchaseAsset.createMany({
        data: data.assetIds.map((assetId) => ({
          purchaseId: id,
          assetId,
        })),
      });

      // Actualizar fecha de compra en los activos
      await tx.asset.updateMany({
        where: { id: { in: data.assetIds } },
        data: { fechaCompra: purchase.fechaFactura },
      });

      // Antes esto no dejaba rastro en AssetHistory -- solo la creación de
      // un activo nuevo desde Nueva Compra lo registraba (SPEC 2.25).
      const usuario = session.user?.email || undefined;
      for (const assetId of data.assetIds) {
        await assetHistoryService.registrarVinculacionCompra(
          assetId,
          purchase.numeroFactura,
          usuario,
          tx
        );
      }

      // Retornar los activos vinculados
      return await tx.purchaseAsset.findMany({
        where: { purchaseId: id },
        include: {
          asset: {
            include: {
              categoria: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al vincular activos a la compra');
  }
}

// DELETE /api/compras/[id]/activos - Desvincular activos de una compra
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const assetIdsParam = searchParams.get("assetIds");

    // Verificar que la compra existe
    const purchase = await prisma.purchase.findUnique({
      where: { id },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    // Borrar/desvincular sigue siendo solo-admin (ver permissions.ts), asi
    // que esto es un no-op hoy -- se deja por consistencia.
    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');

    // Si no se especifican activos, desvincular todos
    let assetIds: string[] | undefined;
    if (assetIdsParam) {
      const assetIdsSchema = z.array(z.string().uuid());
      const validationResult = assetIdsSchema.safeParse(
        assetIdsParam.split(",")
      );

      if (!validationResult.success) {
        return NextResponse.json(
          { error: "IDs de activos inválidos" },
          { status: 400 }
        );
      }
      assetIds = validationResult.data;
    }

    // Desvincular en transacción
    const deletedCount = await prisma.$transaction(async (tx) => {
      const whereCondition: { purchaseId: string; assetId?: { in: string[] } } = {
        purchaseId: id,
      };

      if (assetIds) {
        whereCondition.assetId = { in: assetIds };
      }

      const result = await tx.purchaseAsset.deleteMany({
        where: whereCondition,
      });

      return result.count;
    });

    return NextResponse.json({
      message: `${deletedCount} activo(s) desvinculado(s) exitosamente`,
      deletedCount,
    });
  } catch (error) {
    return handleApiError(error, 'Error al desvincular activos de la compra');
  }
}
