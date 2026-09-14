import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updatePurchaseSchema } from "@/lib/validations/purchase";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { assertSedeAccess, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { ValidationError } from '@/lib/errors';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id] - Obtener compra por ID con sus activos
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
        },
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');

    // Estadísticas de la compra. Sin dato financiero (11-sep-2026): solo
    // cuenta cuántos activos vienen con la factura.
    const stats = {
      cantidadActivos: purchase.purchaseAssets.length,
    };

    return NextResponse.json({
      ...purchase,
      stats,
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener compra');
  }
}

// PUT /api/compras/[id] - Actualizar compra
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'write');

    const { id } = await params;
    const body = await request.json();

    // Verificar que la compra existe
    const existingPurchase = await prisma.purchase.findUnique({
      where: { id },
    });

    if (!existingPurchase) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    assertSedeAccess(session, existingPurchase.sedeId, 'Compra no encontrada');

    const validationResult = updatePurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que la sede existe si se va a cambiar
    if (data.sedeId) {
      const sede = await prisma.sede.findUnique({ where: { id: data.sedeId } });
      if (!sede) {
        return NextResponse.json({ error: "Sede no encontrada" }, { status: 404 });
      }
    }

    // Actualizar la compra. Para tecnico se ignora en silencio el sedeId
    // (no puede mover la compra a otra sede) -- mismo criterio que en la
    // creacion. Ya no hay campos financieros que restringir (11-sep-2026).
    // Para admin, sede es obligatoria (11-sep-2026, igual que al crear):
    // si manda explicitamente sedeId: null se rechaza en vez de vaciarla.
    const esAdmin = tieneVisibilidadTotal(session);
    if (esAdmin && data.sedeId === null) {
      throw new ValidationError('Debes seleccionar una sede.');
    }

    const purchase = await prisma.purchase.update({
      where: { id },
      data: {
        ...(esAdmin && data.sedeId !== undefined && { sedeId: data.sedeId }),
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
        purchaseAssets: {
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json(purchase);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar compra');
  }
}

// DELETE /api/compras/[id] - Eliminar compra
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await requirePermission('compras', 'delete');

    const { id } = await params;

    // Verificar que la compra existe
    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        purchaseAssets: true,
      },
    });

    if (!purchase) {
      return NextResponse.json(
        { error: "Compra no encontrada" },
        { status: 404 }
      );
    }

    // Borrar sigue siendo solo-admin (ver permissions.ts), asi que esto es
    // un no-op hoy -- se deja por consistencia con el resto de las rutas.
    assertSedeAccess(session, purchase.sedeId, 'Compra no encontrada');

    // Eliminar en transacción (primero los activos vinculados, luego la compra)
    await prisma.$transaction(async (tx) => {
      // Eliminar vínculos con activos
      if (purchase.purchaseAssets.length > 0) {
        await tx.purchaseAsset.deleteMany({
          where: { purchaseId: id },
        });
      }

      // Eliminar la compra
      await tx.purchase.delete({
        where: { id },
      });
    });

    return NextResponse.json({ message: "Compra eliminada exitosamente" });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar compra');
  }
}
