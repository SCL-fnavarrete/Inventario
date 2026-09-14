import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateSupplierSchema } from "@/lib/validations/supplier";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/proveedores/[id] - Obtener proveedor por ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('proveedores', 'read');

    const { id } = await params;

    // 14-sep-2026: se quitan los includes de `purchases` y `_count.purchases`
    // -- Supplier y Purchase estan desvinculados desde el 11-sep-2026 (Purchase
    // ya no tiene proveedorId, solo un `rutProveedor` de texto libre, ver
    // comentario en el modelo Purchase de schema.prisma), asi que esa relacion
    // no existe en Prisma y esto ni siquiera compilaba. Bug preexistente,
    // detectado ahora porque el CI corre `tsc` y antes no se habia corrido.
    const supplier = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error, 'Error al obtener proveedor');
  }
}

// PUT /api/proveedores/[id] - Actualizar proveedor
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('proveedores', 'write');

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
    });

    return NextResponse.json(supplier);
  } catch (error) {
    return handleApiError(error, 'Error al actualizar proveedor');
  }
}

// DELETE /api/proveedores/[id] - Eliminar proveedor
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission('proveedores', 'delete');

    const { id } = await params;

    // Verificar que el proveedor existe
    const supplier = await prisma.supplier.findUnique({
      where: { id },
    });

    if (!supplier) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 }
      );
    }

    // 14-sep-2026: se quita el bloqueo "no se puede eliminar si tiene compras
    // asociadas" -- Supplier y Purchase estan desvinculados desde el
    // 11-sep-2026 (Purchase solo guarda un `rutProveedor` de texto libre, sin
    // relacion real a Supplier), asi que ya no hay forma de contar compras
    // asociadas a un proveedor del catalogo. Bug preexistente que ni siquiera
    // compilaba (_count.purchases sobre una relacion que no existe).

    // Eliminar el proveedor
    await prisma.supplier.delete({
      where: { id },
    });

    return NextResponse.json({ message: "Proveedor eliminado exitosamente" });
  } catch (error) {
    return handleApiError(error, 'Error al eliminar proveedor');
  }
}
