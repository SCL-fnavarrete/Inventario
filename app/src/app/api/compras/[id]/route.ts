import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { updatePurchaseSchema } from "@/modules/compras/validaciones";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/shared/auth/guard';
import { NotFoundError } from '@/shared/errores';
import {
  avanceReparto,
  editarCompra,
  eliminarCompra,
  sinAsignacion,
} from '@/modules/compras/servicio';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id] - Compra con sus equipos, su Kit/EPP y el avance del
// reparto. La ven admin y tecnico (SPEC 2.111.6).
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('compras', 'read');

    const { id } = await params;

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        sede: {
          select: { id: true, nombre: true, codigo: true },
        },
        purchaseAssets: {
          include: {
            asset: {
              include: {
                categoria: true,
                sede: { select: { id: true, nombre: true } },
              },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        // Lineas de Kit/EPP compradas con esta factura, y a donde se
        // repartio cada parte (SPEC 2.111).
        purchaseKitItems: {
          include: {
            item: true,
            repartos: {
              include: {
                sede: { select: { id: true, nombre: true } },
                guide: { select: { id: true, numero: true, estado: true } },
              },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        // Despachos que creo el reparto hacia otras sedes.
        despachos: {
          select: {
            id: true,
            numero: true,
            estado: true,
            fechaDespacho: true,
            sedeDestino: { select: { id: true, nombre: true } },
            _count: { select: { items: true, kitItems: true } },
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    if (!purchase) throw new NotFoundError('Compra no encontrada');

    // Un equipo descartado (se quito antes de repartirlo) ya no es parte de
    // la compra que se muestra; su registro queda en el historial.
    // Compras muestra los equipos comprados y a que sede se repartieron, no
    // a quien estan asignados (SPEC 2.111.6): ni a admin ni a tecnico.
    const purchaseAssets = purchase.purchaseAssets
      .filter((pa) => !pa.asset.deletedAt)
      .map((pa) => ({ ...pa, asset: sinAsignacion(pa.asset) }));

    return NextResponse.json({
      ...purchase,
      purchaseAssets,
      reparto: avanceReparto(purchase),
      stats: {
        cantidadActivos: purchaseAssets.length,
        cantidadArticulosKit: purchase.purchaseKitItems.length,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener compra');
  }
}

// PUT /api/compras/[id] - Editar los datos de la factura (solo admin). La
// sede de llegada solo cambia mientras no se haya repartido nada.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');
    const { id } = await params;
    const parsed = updatePurchaseSchema.safeParse(await request.json());
    if (!parsed.success) return respuestaDatosInvalidos(parsed.error);
    return NextResponse.json(await editarCompra(id, parsed.data, session.user?.email));
  } catch (error) {
    return handleApiError(error, 'Error al actualizar compra');
  }
}

// DELETE /api/compras/[id] - Eliminar una compra (solo admin), solo si no se
// repartio nada (SPEC 2.111.7).
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');
    const { id } = await params;
    await eliminarCompra(id, session.user?.email || 'sistema');
    return NextResponse.json({ message: "Compra eliminada exitosamente" });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar compra');
  }
}
