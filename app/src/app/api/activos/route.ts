import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createAssetSchema } from "@/lib/validations/asset";
import { assetHistoryService } from "@/lib/services/assetHistoryService";
import { ZodError } from "zod";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "";
    const categoriaId = searchParams.get("categoriaId") || "";

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
    console.error("Error fetching assets:", error);
    return NextResponse.json(
      { error: "Error al obtener activos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

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
          { message: "Ya existe un activo con este número de serie" },
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
      },
    });

    // Registrar en historial usando el servicio
    await assetHistoryService.registrarCreacion(
      asset,
      session.user?.email || "sistema"
    );

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: "Error de validación",
          errors: error.issues.map((e) => ({
            field: String(e.path.join('.')),
            message: e.message
          }))
        },
        { status: 400 }
      );
    }
    console.error("Error creating asset:", error);
    return NextResponse.json(
      { error: "Error al crear activo" },
      { status: 500 }
    );
  }
}
