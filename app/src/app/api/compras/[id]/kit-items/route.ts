import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/shared/prisma";
import { linkKitItemsToPurchaseSchema } from "@/modules/compras";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errores';
import { agregarLineasKit } from '@/modules/compras/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Kit/EPP de una compra (SPEC 2.111). Cada linea es un articulo del catalogo
// de la sede de llegada y una cantidad, que queda "por repartir": el stock
// sube recien al repartirla, no al registrarla.

async function buscarCompra(id: string) {
  const compra = await prisma.purchase.findUnique({ where: { id } });
  if (!compra) throw new NotFoundError('Compra no encontrada');
  return compra;
}

// GET /api/compras/[id]/kit-items - Líneas de Kit/EPP de una compra
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'read');

    const { id } = await params;
    await buscarCompra(id);

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

// POST /api/compras/[id]/kit-items - Agregar Kit/EPP a una compra (solo admin)
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'write');

    const { id } = await params;
    const compra = await buscarCompra(id);

    const validationResult = linkKitItemsToPurchaseSchema.safeParse(await request.json());
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const result = await prisma.$transaction(async (tx) => {
      await agregarLineasKit(tx, compra, validationResult.data.items);
      return tx.purchaseKitItem.findMany({
        where: { purchaseId: id },
        include: { item: true },
        orderBy: { createdAt: "asc" },
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al agregar artículos de Kit/EPP a la compra');
  }
}

// DELETE /api/compras/[id]/kit-items?lineIds=... - Quitar líneas de Kit/EPP
// (solo admin). Solo las que no se han repartido: todavia no sumaron stock,
// asi que no hay nada que revertir.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'delete');

    const { id } = await params;
    await buscarCompra(id);

    const ids = z
      .array(z.string().uuid())
      .min(1)
      .safeParse((request.nextUrl.searchParams.get("lineIds") || "").split(",").filter(Boolean));
    if (!ids.success) throw new ValidationError('Indica las líneas a quitar');

    const lineas = await prisma.purchaseKitItem.findMany({
      where: { purchaseId: id, id: { in: ids.data } },
      include: { item: { select: { nombre: true } } },
    });
    if (lineas.length === 0) throw new NotFoundError('Esas líneas no son de esta compra');

    const repartidas = lineas.filter((l) => l.cantidadPorRepartir < l.cantidad);
    if (repartidas.length > 0) {
      throw new ConflictError(
        `Ya se repartió parte de ${repartidas.map((l) => l.item.nombre).join(', ')}: no se puede quitar de la compra`
      );
    }

    const { count } = await prisma.purchaseKitItem.deleteMany({
      where: { id: { in: lineas.map((l) => l.id) } },
    });

    return NextResponse.json({
      message: `${count} artículo(s) de Kit/EPP quitado(s) de la compra`,
      deletedCount: count,
    });
  } catch (error) {
    return handleApiError(error, 'Error al quitar artículos de Kit/EPP de la compra');
  }
}
