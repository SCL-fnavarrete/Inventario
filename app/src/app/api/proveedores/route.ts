import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createSupplierSchema,
  supplierFiltersSchema,
} from "@/lib/validations/supplier";
import { Prisma } from "@prisma/client";

// GET /api/proveedores - Listar proveedores con filtros y paginación
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;

    const filtersResult = supplierFiltersSchema.safeParse({
      search: searchParams.get("search") || undefined,
      page: searchParams.get("page") || 1,
      limit: searchParams.get("limit") || 10,
      sortBy: searchParams.get("sortBy") || "razonSocial",
      sortOrder: searchParams.get("sortOrder") || "asc",
    });

    if (!filtersResult.success) {
      return NextResponse.json(
        { error: "Parámetros inválidos", details: filtersResult.error.issues },
        { status: 400 }
      );
    }

    const filters = filtersResult.data;
    const skip = (filters.page - 1) * filters.limit;

    // Construir condiciones de búsqueda
    const where: Prisma.SupplierWhereInput = {};

    if (filters.search) {
      where.OR = [
        { razonSocial: { contains: filters.search, mode: "insensitive" } },
        { rutEmpresa: { contains: filters.search, mode: "insensitive" } },
        { email: { contains: filters.search, mode: "insensitive" } },
        { nombreContacto: { contains: filters.search, mode: "insensitive" } },
      ];
    }

    // Ejecutar consulta
    const [suppliers, total] = await Promise.all([
      prisma.supplier.findMany({
        where,
        include: {
          _count: {
            select: { purchases: true },
          },
        },
        orderBy: { [filters.sortBy]: filters.sortOrder },
        skip,
        take: filters.limit,
      }),
      prisma.supplier.count({ where }),
    ]);

    return NextResponse.json({
      data: suppliers,
      pagination: {
        total,
        page: filters.page,
        limit: filters.limit,
        totalPages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    console.error("Error fetching suppliers:", error);
    return NextResponse.json(
      { error: "Error al obtener proveedores" },
      { status: 500 }
    );
  }
}

// POST /api/proveedores - Crear nuevo proveedor
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const body = await request.json();

    const validationResult = createSupplierSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { error: "Datos inválidos", details: validationResult.error.issues },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // Verificar si ya existe un proveedor con el mismo RUT (si se proporciona)
    if (data.rutEmpresa) {
      const existingSupplier = await prisma.supplier.findFirst({
        where: { rutEmpresa: data.rutEmpresa },
      });

      if (existingSupplier) {
        return NextResponse.json(
          { error: "Ya existe un proveedor con este RUT" },
          { status: 409 }
        );
      }
    }

    // Crear el proveedor
    const supplier = await prisma.supplier.create({
      data: {
        rutEmpresa: data.rutEmpresa,
        razonSocial: data.razonSocial,
        nombreContacto: data.nombreContacto,
        email: data.email,
        telefono: data.telefono,
        direccion: data.direccion,
      },
      include: {
        _count: {
          select: { purchases: true },
        },
      },
    });

    return NextResponse.json(supplier, { status: 201 });
  } catch (error) {
    console.error("Error creating supplier:", error);
    return NextResponse.json(
      { error: "Error al crear proveedor" },
      { status: 500 }
    );
  }
}
