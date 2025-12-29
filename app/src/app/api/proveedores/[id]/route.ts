import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { updateSupplierSchema } from "@/lib/validations/supplier";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/proveedores/[id] - Obtener proveedor por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        purchases: {
          include: {
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
          orderBy: { fechaFactura: "desc" },
        },
        _count: {
          select: { purchases: true },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(supplier);
  } catch (error) {
    console.error("Error fetching supplier:", error);
    return NextResponse.json(
      { error: "Error al obtener proveedor" },
      { status: 500 }
    );
  }
}

// PUT /api/proveedores/[id] - Actualizar proveedor
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    // Verificar que el proveedor existe
    const existingSupplier = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!existingSupplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    const validationResult = updateSupplierSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar si el nuevo RUT ya existe en otro proveedor
    if (data.rutEmpresa && data.rutEmpresa !== existingSupplier.rutEmpresa) {
      const duplicateRut = await prisma.supplier.findFirst({
        where: {
          rutEmpresa: data.rutEmpresa,
          NOT: { id },
        },
      });

      if (duplicateRut) {
        return NextResponse.json(
          { error: "Ya existe un proveedor con este RUT" },
          { status: 409 }
        );
      }
    }

    // Actualizar el proveedor
    const supplier = await prisma.supplier.update({
      where: { id },
      data: {
        ...(data.rutEmpresa !== undefined && { rutEmpresa: data.rutEmpresa }),
        ...(data.razonSocial !== undefined && { razonSocial: data.razonSocial }),
        ...(data.nombreContacto !== undefined && { nombreContacto: data.nombreContacto }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.telefono !== undefined && { telefono: data.telefono }),
        ...(data.direccion !== undefined && { direccion: data.direccion }),
      },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    return NextResponse.json(supplier);
  } catch (error) {
    console.error("Error updating supplier:", error);
    return NextResponse.json(
      { error: "Error al actualizar proveedor" },
      { status: 500 }
    );
  }
}

// DELETE /api/proveedores/[id] - Eliminar proveedor
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const { id } = await params;

    // Verificar que el proveedor existe
    const supplier = await prisma.supplier.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    // Verificar que no tiene compras asociadas
    if (supplier._count.purchases > 0) {
      return NextResponse.json(
        {
          error: "No se puede eliminar el proveedor porque tiene compras asociadas",
          purchasesCount: supplier._count.purchases,
        },
        { status: 400 }
      );
    }

    // Eliminar el proveedor
    await prisma.supplier.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Proveedor eliminado exitosamente" });
  } catch (error) {
    console.error("Error deleting supplier:", error);
    return NextResponse.json(
      { error: "Error al eliminar proveedor" },
      { status: 500 }
    );
  }
}
