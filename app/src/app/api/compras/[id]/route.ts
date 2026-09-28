import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { updatePurchaseSchema } from "@/lib/validations/purchase";
import { requirePermission, handleApiError, respuestaDatosInvalidos } from '@/lib/auth/guard';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { auditLogService } from '@/lib/services/auditLogService';
import {
  INCLUDE_AVANCE_REPARTO,
  avanceReparto,
  exigirSinReparto,
  moverSedeDeLlegada,
  quitarEquipo,
} from '@/lib/services/compraService';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id] - Compra con sus equipos, su Kit/EPP y el avance del
// reparto. La ven admin y tecnico (SPEC 2.111.6).
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'read');

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
    // Quien tiene un equipo de OTRA sede no es dato de este tecnico
    // (auditoria 27-sep-2026, 2.12): la compra se ve completa, pero sin el
    // nombre ni el RUT de personas que no son de su sede.
    const verTodo = tieneVisibilidadTotal(session);
    const purchaseAssets = purchase.purchaseAssets
      .filter((pa) => !pa.asset.deletedAt)
      .map((pa) =>
        verTodo || pa.asset.sedeId === session.user.sedeId
          ? pa
          : { ...pa, asset: { ...pa.asset, empleadoActual: null } }
      );

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
    const body = await request.json();

    const existingPurchase = await prisma.purchase.findUnique({
      where: { id },
      include: INCLUDE_AVANCE_REPARTO,
    });
    if (!existingPurchase) throw new NotFoundError('Compra no encontrada');

    const validationResult = updatePurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return respuestaDatosInvalidos(validationResult.error);
    }

    const data = validationResult.data;

    if (data.sedeId === null) {
      throw new ValidationError('Elige la sede de llegada', [
        { field: 'sedeId', message: 'Elige la sede de llegada' },
      ]);
    }
    const cambiaSede = !!data.sedeId && data.sedeId !== existingPurchase.sedeId;
    if (cambiaSede) {
      exigirSinReparto(existingPurchase, 'cambiar la sede de llegada');
      const sede = await prisma.sede.findUnique({ where: { id: data.sedeId! } });
      if (!sede) throw new NotFoundError('La sede de llegada no existe');
    }

    // N° de factura unico en todo el sistema, excluyendo la propia compra que se edita.
    if (data.numeroFactura) {
      const duplicada = await prisma.purchase.findFirst({
        where: { numeroFactura: data.numeroFactura, id: { not: id } },
        select: { id: true },
      });
      if (duplicada) {
        return respuestaDatosInvalidos(
          new z.ZodError([
            {
              code: "custom",
              path: ["numeroFactura"],
              message: `Ya existe otra compra con la factura ${data.numeroFactura}.`,
            },
          ])
        );
      }
    }

    const purchase = await prisma.$transaction(async (tx) => {
      // Lo que espera "Por repartir" esta fisicamente en la sede de llegada:
      // si se corrige la sede, se mueve con ella.
      if (cambiaSede) await moverSedeDeLlegada(tx, id, data.sedeId!);

      const actualizada = await tx.purchase.update({
        where: { id },
        data: {
          ...(cambiaSede && { sedeId: data.sedeId }),
          ...(data.numeroFactura !== undefined && { numeroFactura: data.numeroFactura }),
          ...(data.fechaFactura !== undefined && { fechaFactura: data.fechaFactura }),
          ...(data.rutProveedor !== undefined && { rutProveedor: data.rutProveedor }),
          ...(data.tipoCompra !== undefined && { tipoCompra: data.tipoCompra }),
          ...(data.descripcion !== undefined && { descripcion: data.descripcion }),
          ...(data.compradoPor !== undefined && { compradoPor: data.compradoPor }),
          ...(data.ordenCompra !== undefined && { ordenCompra: data.ordenCompra }),
        },
        include: {
          sede: {
            select: { id: true, nombre: true, codigo: true },
          },
        },
      });

      // Auditoria generica: que cambio y quien lo hizo.
      await auditLogService.registrarActualizacion(
        'compra',
        actualizada.id,
        `Compra actualizada: factura ${actualizada.numeroFactura}`,
        {
          numeroFactura: existingPurchase.numeroFactura,
          rutProveedor: existingPurchase.rutProveedor,
          tipoCompra: existingPurchase.tipoCompra,
          sedeId: existingPurchase.sedeId,
        },
        {
          numeroFactura: actualizada.numeroFactura,
          rutProveedor: actualizada.rutProveedor,
          tipoCompra: actualizada.tipoCompra,
          sedeId: actualizada.sedeId,
        },
        session.user?.email,
        tx
      );
      return actualizada;
    });

    return NextResponse.json(purchase);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar compra');
  }
}

// DELETE /api/compras/[id] - Eliminar una compra (solo admin), solo si no se
// repartio nada (SPEC 2.111.7). Sus equipos "Por repartir" se descartan
// (nunca se usaron; el historial los conserva) y sus lineas de Kit/EPP se
// borran: todavia no habian sumado stock.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');
    const usuario = session.user?.email || 'sistema';

    const { id } = await params;

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        purchaseAssets: { include: { asset: { select: { estado: true, deletedAt: true } } } },
        purchaseKitItems: true,
      },
    });
    if (!purchase) throw new NotFoundError('Compra no encontrada');

    exigirSinReparto(purchase, 'eliminar la compra');

    await prisma.$transaction(async (tx) => {
      for (const vinculo of purchase.purchaseAssets) {
        if (vinculo.asset.deletedAt) {
          await tx.purchaseAsset.delete({ where: { id: vinculo.id } });
        } else {
          await quitarEquipo(tx, purchase, vinculo, usuario);
        }
      }
      await tx.purchaseKitItem.deleteMany({ where: { purchaseId: id } });

      // Auditoria antes del delete fisico: el snapshot es lo unico que
      // queda de esta compra despues de esto.
      await auditLogService.registrarEliminacion(
        'compra',
        purchase.id,
        `Compra eliminada: factura ${purchase.numeroFactura}`,
        {
          numeroFactura: purchase.numeroFactura,
          rutProveedor: purchase.rutProveedor,
          tipoCompra: purchase.tipoCompra,
          sedeId: purchase.sedeId,
          cantidadActivosVinculados: purchase.purchaseAssets.length,
          cantidadArticulosKitVinculados: purchase.purchaseKitItems.length,
        },
        usuario,
        tx
      );

      await tx.purchase.delete({ where: { id } });
    });

    return NextResponse.json({ message: "Compra eliminada exitosamente" });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar compra');
  }
}
