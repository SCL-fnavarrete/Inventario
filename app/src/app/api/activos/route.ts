import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAssetSchema } from "@/lib/validations/asset";
import { assetHistoryService } from "@/lib/services/assetHistoryService";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

export async function GET(request: NextRequest) {
  try {
    await requirePermission('activos', 'read');

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "";
    const categoriaId = searchParams.get("categoriaId") || "";
    const empleadoActualId = searchParams.get("empleadoActualId") || "";

    const where: Record<string, unknown> = {};

    if (search) {
      where.OR = [
        { numeroSerie: { contains: search, mode: "insensitive" } },
        { marca: { contains: search, mode: "insensitive" } },
        { modelo: { contains: search, mode: "insensitive" } },
        { numeroActivoInterno: { contains: search, mode: "insensitive" } },
      ];
    }

    if (estado) {
      where.estado = estado;
    }

    if (categoriaId) {
      where.categoriaId = categoriaId;
    }

    if (empleadoActualId) {
      where.empleadoActualId = empleadoActualId;
    }

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include: {
          categoria: {
            select: { id: true, nombre: true },
          },
          empleadoActual: {
            select: {
              id: true,
              nombres: true,
              apellidoPaterno: true,
              correo: true,
              cargo: true
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.asset.count({ where }),
    ]);

    return NextResponse.json({
      data: assets,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
        limit,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener activos');
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'write');

    const body = await request.json();

    // Validar datos con Zod
    const validatedData = createAssetSchema.parse(body);

    // Verificar si el número de serie ya existe (solo si se proporciona)
    if (validatedData.numeroSerie) {
      const existingAsset = await prisma.asset.findUnique({
        where: { numeroSerie: validatedData.numeroSerie },
      });

      if (existingAsset) {
        return NextResponse.json(
          { error: "Ya existe un activo con este numero de serie" },
          { status: 400 }
        );
      }
    }

    const asset = await prisma.asset.create({
      data: {
        categoriaId: validatedData.categoriaId,
        marca: validatedData.marca,
        modelo: validatedData.modelo,
        numeroSerie: validatedData.numeroSerie || null,
        numeroActivoInterno: validatedData.numeroActivoInterno || null,
        estado: validatedData.estado || "disponible",
        condicion: validatedData.condicion || "nuevo",
        fechaCompra: validatedData.fechaCompra ? new Date(validatedData.fechaCompra) : null,
        fechaGarantiaFin: validatedData.fechaGarantiaFin ? new Date(validatedData.fechaGarantiaFin) : null,
        fechaBaja: validatedData.fechaBaja ? new Date(validatedData.fechaBaja) : null,
        procesador: validatedData.procesador || null,
        ram: validatedData.ram || null,
        discoDuro: validatedData.discoDuro || null,
        sistemaOperativo: validatedData.sistemaOperativo || null,
        imei: validatedData.imei || null,
        numeroTelefono: validatedData.numeroTelefono || null,
        numeroActivacion: validatedData.numeroActivacion || null,
        tipoPlan: validatedData.tipoPlan || null,
        tieneCargador: validatedData.tieneCargador || false,
        pulgadas: validatedData.pulgadas || null,
        ubicacionFisica: validatedData.ubicacionFisica || null,
        microsoft365: validatedData.microsoft365 || false,
        intuneEnrolled: validatedData.intuneEnrolled || false,
        listaDistribucion: validatedData.listaDistribucion || null,
        observaciones: validatedData.observaciones || null,
        operador: validatedData.operador || null,
        antivirus: validatedData.antivirus || null,
        incidencia: validatedData.incidencia || null,
        nombreEquipo: validatedData.nombreEquipo || null,
      },
    });

    // Registrar en historial usando el servicio
    await assetHistoryService.registrarCreacion(
      asset,
      session.user?.email || "sistema"
    );

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear activo');
  }
}
