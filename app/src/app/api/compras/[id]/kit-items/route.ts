import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { linkKitItemsToPurchaseSchema } from "@/lib/validations/purchase";
import { z } from "zod";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { auditLogService } from '@/lib/services/auditLogService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Vinculación de artículos de Kit/EPP a una compra (14-sep-2026, SPEC 2.36,
// pedido explícito de Javier: "aveces el kit de bievenida o epp tambien lo
// compran ... solo funciona con los equipos pero no con el kitt de
// bievenida o epp"). Mismo patrón que /api/compras/[id]/activos, salvo que
// acá no se vincula una unidad existente: cada línea SUMA una cantidad al
// stock del artículo (WelcomeKitItem.cantidad), y al desvincularse se
// resta de vuelta (sin bajar de 0).

// GET /api/compras/[id]/kit-items - Listar líneas de Kit/EPP de una compra
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'read');

    const { id } = await params;

    const purchase = await prisma.purchase.findUnique({ where: { id } });
    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }
    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');

    const purchaseKitItems = await prisma.purchaseKitItem.findMany({
      where: { purchaseId: id },
      include: { item: true },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      data: purchaseKitItems,
      stats: { totalArticulos: purchaseKitItems.length },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener artículos de Kit/EPP de la compra');
  }
}

// POST /api/compras/[id]/kit-items - Agregar artículos de Kit/EPP a una compra
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');

    const { id } = await params;
    const body = await request.json();

    const purchase = await prisma.purchase.findUnique({ where: { id } });
    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }
    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');
    const esAdmin = tieneVisibilidadTotal(session);

    const validationResult = linkKitItemsToPurchaseSchema.safeParse(body);
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;
    const itemIds = data.items.map((i) => i.itemId);

    const existingItems = await prisma.welcomeKitItem.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, nombre: true, cantidad: true, sedeId: true },
    });

    const existingItemIds = new Set(existingItems.map((i) => i.id));
    const missingItems = itemIds.filter((itemId) => !existingItemIds.has(itemId));
    if (missingItems.length > 0) {
      return NextResponse.json(
        { error: "Algunos artículos de Kit/EPP no existen", missingItems },
        { status: 404 }
      );
    }

    if (!esAdmin) {
      const ajenos = existingItems.filter((i) => i.sedeId !== session.user.sedeId);
      if (ajenos.length > 0) {
        return NextResponse.json(
          { error: "Algunos artículos de Kit/EPP no pertenecen a tu sede" },
          { status: 400 }
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const creadas = [];
      for (const linea of data.items) {
        const nueva = await tx.purchaseKitItem.create({
          data: { purchaseId: id, itemId: linea.itemId, cantidad: linea.cantidad },
        });
        creadas.push(nueva);

        const item = existingItems.find((i) => i.id === linea.itemId);
        const updatedItem = await tx.welcomeKitItem.update({
          where: { id: linea.itemId },
          data: { cantidad: { increment: linea.cantidad } },
        });

        await auditLogService.registrarActualizacion(
          'kit_item',
          linea.itemId,
          `Stock repuesto por compra${purchase.numeroFactura ? ` (factura ${purchase.numeroFactura})` : ""}: +${linea.cantidad} ${item?.nombre ?? ""}`.trim(),
          { cantidad: item?.cantidad ?? null },
          { cantidad: updatedItem.cantidad },
          session.user?.email,
          tx
        );
      }

      return await tx.purchaseKitItem.findMany({
        where: { purchaseId: id },
        include: { item: true },
        orderBy: { createdAt: "desc" },
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al vincular artículos de Kit/EPP a la compra');
  }
}

// DELETE /api/compras/[id]/kit-items?lineIds=... - Desvincular líneas de
// Kit/EPP de una compra, revirtiendo el stock que habían sumado (sin bajar
// de 0, por si ya se entregó parte a un empleado mientras tanto).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');

    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const lineIdsParam = searchParams.get("lineIds");

    const purchase = await prisma.purchase.findUnique({ where: { id } });
    if (!purchase) {
      return NextResponse.json({ error: "Compra no encontrada" }, { status: 404 });
    }
    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');

    let lineIds: string[] | undefined;
    if (lineIdsParam) {
      const lineIdsSchema = z.array(z.string().uuid());
      const validationResult = lineIdsSchema.safeParse(lineIdsParam.split(","));
      if (!validationResult.success) {
        return NextResponse.json({ error: "IDs de línea inválidos" }, { status: 400 });
      }
      lineIds = validationResult.data;
    }

    const lineasABorrar = await prisma.purchaseKitItem.findMany({
      where: { purchaseId: id, ...(lineIds ? { id: { in: lineIds } } : {}) },
      include: { item: true },
    });

    const deletedCount = await prisma.$transaction(async (tx) => {
      for (const linea of lineasABorrar) {
        // No baja de 0: si ya se entregó más stock del que esta línea trajo,
        // no tiene sentido dejar el contador en negativo.
        const nuevaCantidad = Math.max(0, linea.item.cantidad - linea.cantidad);
        const updatedItem = await tx.welcomeKitItem.update({
          where: { id: linea.itemId },
          data: { cantidad: nuevaCantidad },
        });

        await auditLogService.registrarActualizacion(
          'kit_item',
          linea.itemId,
          `Stock revertido: compra desvinculada (factura ${purchase.numeroFactura ?? "s/n"}): -${linea.cantidad} ${linea.item.nombre}`,
          { cantidad: linea.item.cantidad },
          { cantidad: updatedItem.cantidad },
          session.user?.email,
          tx
        );
      }

      const result = await tx.purchaseKitItem.deleteMany({
        where: { id: { in: lineasABorrar.map((l) => l.id) } },
      });

      return result.count;
    });

    return NextResponse.json({
      message: `${deletedCount} artículo(s) de Kit/EPP desvinculado(s) exitosamente`,
      deletedCount,
    });
  } catch (error) {
    return handleApiError(error, 'Error al desvincular artículos de Kit/EPP de la compra');
  }
}
