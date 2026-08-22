import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { EstadoGuia, TipoDespacho } from "@prisma/client";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// GET /api/guias-despacho - Listar guías de despacho
export async function GET(request: NextRequest) {
  try {
    await requirePermission('guias', 'read');
    const searchParams = request.nextUrl.searchParams;
    const estado = searchParams.get("estado") as EstadoGuia | null;
    const busqueda = searchParams.get("busqueda");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");

    const where: Record<string, unknown> = {};

    if (estado) {
      where.estado = estado;
    }

    if (busqueda) {
      where.OR = [
        { numero: { contains: busqueda, mode: "insensitive" } },
        { destinatarioNombre: { contains: busqueda, mode: "insensitive" } },
        { destinatarioRut: { contains: busqueda, mode: "insensitive" } },
        { origen: { contains: busqueda, mode: "insensitive" } },
        { destino: { contains: busqueda, mode: "insensitive" } },
      ];
    }

    const [guides, total] = await Promise.all([
      prisma.dispatchGuide.findMany({
        where,
        include: {
          _count: {
            select: { items: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.dispatchGuide.count({ where }),
    ]);

    return NextResponse.json({
      data: guides,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener guías de despacho');
  }
}

// POST /api/guias-despacho - Crear nueva guía de despacho
export async function POST(request: NextRequest) {
  try {
    await requirePermission('guias', 'write');
    const body = await request.json();
    const {
      origen,
      destino,
      tipoDespacho,
      despachadoPor,
      fechaDespacho,
      destinatarioId,
      destinatarioNombre,
      destinatarioRut,
      observaciones,
      assetIds,
    } = body;

    // Validaciones básicas
    if (!origen || !destino || !tipoDespacho || !despachadoPor || !fechaDespacho) {
      return NextResponse.json(
        { error: "Faltan campos requeridos" },
        { status: 400 }
      );
    }

    if (!assetIds || assetIds.length === 0) {
      return NextResponse.json(
        { error: "Debe seleccionar al menos un activo" },
        { status: 400 }
      );
    }

    // Validar tipo de despacho
    if (!Object.values(TipoDespacho).includes(tipoDespacho)) {
      return NextResponse.json(
        { error: "Tipo de despacho inválido" },
        { status: 400 }
      );
    }

    // Generar número de guía
    const year = new Date().getFullYear();
    const lastGuide = await prisma.dispatchGuide.findFirst({
      where: {
        numero: {
          startsWith: `GD-${year}-`,
        },
      },
      orderBy: { numero: "desc" },
    });

    let nextNumber = 1;
    if (lastGuide) {
      const lastNumber = parseInt(lastGuide.numero.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    const numero = `GD-${year}-${nextNumber.toString().padStart(5, "0")}`;

    // Verificar que los activos existen
    const assets = await prisma.asset.findMany({
      where: { id: { in: assetIds } },
    });

    if (assets.length !== assetIds.length) {
      return NextResponse.json(
        { error: "Algunos activos no fueron encontrados" },
        { status: 400 }
      );
    }

    // Si hay destinatarioId, obtener datos del empleado
    let empleadoData: { nombre: string; rut: string | null } | null = null;
    if (destinatarioId) {
      const empleado = await prisma.employee.findUnique({
        where: { id: destinatarioId },
        select: {
          nombres: true,
          apellidoPaterno: true,
          apellidoMaterno: true,
          rut: true,
        },
      });

      if (empleado) {
        empleadoData = {
          nombre: `${empleado.nombres} ${empleado.apellidoPaterno} ${empleado.apellidoMaterno || ""}`.trim(),
          rut: empleado.rut,
        };
      }
    }

    // Crear guía con items
    const guide = await prisma.dispatchGuide.create({
      data: {
        numero,
        origen,
        destino,
        tipoDespacho,
        despachadoPor,
        fechaDespacho: new Date(fechaDespacho),
        destinatarioId: destinatarioId || null,
        destinatarioNombre: empleadoData?.nombre || destinatarioNombre || null,
        destinatarioRut: empleadoData?.rut || destinatarioRut || null,
        observaciones: observaciones || null,
        estado: EstadoGuia.pendiente,
        items: {
          create: assetIds.map((assetId: string) => ({
            assetId,
          })),
        },
      },
      include: {
        items: {
          include: {
            asset: {
              include: {
                categoria: true,
              },
            },
          },
        },
        destinatario: true,
      },
    });

    return NextResponse.json(guide, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear guía de despacho');
  }
}
