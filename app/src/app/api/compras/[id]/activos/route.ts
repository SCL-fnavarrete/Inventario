import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/shared/prisma";
import { agregarEquiposCompraSchema } from "@/modules/compras";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { NotFoundError, ValidationError } from '@/shared/errores';
import {
  agregarEquiposNuevos,
  quitarEquipo,
  vincularEquiposExistentes,
  sinAsignacion,
} from '@/modules/compras/servidor';

interface RouteParams {
  params: Promise<{ id: string }>;
}

async function buscarCompra(id: string) {
  const compra = await prisma.purchase.findUnique({ where: { id } });
  if (!compra) throw new NotFoundError('Compra no encontrada');
  return compra;
}

const INCLUDE_EQUIPO = {
  asset: {
    include: {
      categoria: true,
      sede: { select: { id: true, nombre: true } },
    },
  },
} as const;

// GET /api/compras/[id]/activos - Equipos de una compra (admin y tecnico).
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'read');

    const { id } = await params;
    await buscarCompra(id);

    const purchaseAssets = await prisma.purchaseAsset.findMany({
      where: { purchaseId: id, asset: { deletedAt: null } },
      include: INCLUDE_EQUIPO,
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({
      data: purchaseAssets.map((pa) => ({ ...pa, asset: sinAsignacion(pa.asset) })),
      stats: {
        totalActivos: purchaseAssets.length,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener activos de la compra');
  }
}

// POST /api/compras/[id]/activos - Agregar equipos a una compra (solo admin):
// comprados (nacen "Por repartir" en la sede de llegada, SPEC 2.111) y/o que
// ya existian (solo se vinculan a la factura).
export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');
    const usuario = session.user?.email || 'sistema';

    const { id } = await params;
    const compra = await buscarCompra(id);

    const validationResult = agregarEquiposCompraSchema.safeParse(await request.json());
    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }
    const data = validationResult.data;

    const result = await prisma.$transaction(async (tx) => {
      await agregarEquiposNuevos(tx, compra, data.equiposNuevos, usuario);
      if (data.assetIds.length > 0) {
        await vincularEquiposExistentes(tx, compra, data.assetIds, usuario);
      }
      return tx.purchaseAsset.findMany({
        where: { purchaseId: id, asset: { deletedAt: null } },
        include: INCLUDE_EQUIPO,
        orderBy: { createdAt: "asc" },
      });
    });

    return NextResponse.json(
      result.map((pa) => ({ ...pa, asset: sinAsignacion(pa.asset) })),
      { status: 201 }
    );
  } catch (error) {
    return handleApiError(error, 'Error al agregar equipos a la compra');
  }
}

// DELETE /api/compras/[id]/activos?assetIds=... - Quitar equipos de una
// compra (solo admin). Uno comprado que sigue "Por repartir" se descarta; uno
// ya repartido no se quita; uno solo vinculado se desvincula.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');
    const usuario = session.user?.email || 'sistema';

    const { id } = await params;
    const compra = await buscarCompra(id);

    const ids = z
      .array(z.string().uuid())
      .min(1)
      .safeParse((request.nextUrl.searchParams.get("assetIds") || "").split(",").filter(Boolean));
    if (!ids.success) throw new ValidationError('Indica los equipos a quitar');

    const vinculos = await prisma.purchaseAsset.findMany({
      where: { purchaseId: id, assetId: { in: ids.data }, asset: { deletedAt: null } },
      include: { asset: { select: { estado: true } } },
    });
    if (vinculos.length === 0) throw new NotFoundError('Esos equipos no son de esta compra');

    await prisma.$transaction(async (tx) => {
      for (const vinculo of vinculos) await quitarEquipo(tx, compra, vinculo, usuario);
    });

    return NextResponse.json({
      message: `${vinculos.length} equipo(s) quitado(s) de la compra`,
      deletedCount: vinculos.length,
    });
  } catch (error) {
    return handleApiError(error, 'Error al quitar equipos de la compra');
  }
}
