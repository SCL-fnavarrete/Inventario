import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updatePurchaseSchema } from "@/lib/validations/purchase";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/compras/[id] - Obtener compra por ID con sus activos
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      include: {
        supplier: true,
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

    // Calcular estadísticas de la compra
    const stats = {
      cantidadActivos: purchase.purchaseAssets.length,
      montoTotalActivos: purchase.purchaseAssets.reduce(
        (sum, pa) => sum + (pa.precioUnitario?.toNumber() || 0),
        0
      ),
    };

    return NextResponse.json({
      ...purchase,
      stats,
    });
  } catch (error) {
    console.error("Error fetching purchase:", error);
    return NextResponse.json(
      { error: "Error al obtener compra" },
      { status: 500 }
    );
  }
}

// PUT /api/compras/[id] - Actualizar compra
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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

    const validationResult = updatePurchaseSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar que el proveedor existe si se va a cambiar
    if (data.supplierId) {
      const supplier = await prisma.supplier.findUnique({
        where: { id: data.supplierId },
      });

      if (!supplier) {
        return NextResponse.json(
          { error: "Proveedor no encontrado" },
          { status: 404 }
        );
      }
    }

    // Actualizar la compra
    const purchase = await prisma.purchase.update({
      where: { id },
      data: {
        ...(data.supplierId !== undefined && { supplierId: data.supplierId }),
        ...(data.numeroFactura !== undefined && { numeroFactura: data.numeroFactura }),
        ...(data.fechaFactura !== undefined && { fechaFactura: data.fechaFactura }),
        ...(data.montoTotal !== undefined && { montoTotal: data.montoTotal }),
        ...(data.moneda !== undefined && { moneda: data.moneda }),
        ...(data.ordenCompra !== undefined && { ordenCompra: data.ordenCompra }),
        ...(data.documentoUrl !== undefined && { documentoUrl: data.documentoUrl }),
      },
      include: {
        supplier: {
          select: {
            id: true,
            razonSocial: true,
            rutEmpresa: true,
          },
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
    console.error("Error updating purchase:", error);
    return NextResponse.json(
      { error: "Error al actualizar compra" },
      { status: 500 }
    );
  }
}

// DELETE /api/compras/[id] - Eliminar compra
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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
    console.error("Error deleting purchase:", error);
    return NextResponse.json(
      { error: "Error al eliminar compra" },
      { status: 500 }
    );
  }
}
