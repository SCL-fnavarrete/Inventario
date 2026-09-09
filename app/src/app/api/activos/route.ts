import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAssetSchema } from "@/lib/validations/asset";
import { assetHistoryService } from "@/lib/services/assetHistoryService";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

/**
 * Tope de filas por pagina. Protege la base de un ?limit arbitrario.
 *
 * 500 y no menos: SelectorActivos (guias de despacho) pide limit=200 para
 * llenar su lista de una vez. Un tope por debajo de eso truncaria ese
 * selector en silencio, que es peor que no tener tope.
 */
const LIMITE_MAXIMO_PAGINA = 500;

export async function GET(request: NextRequest) {
  try {
    await requirePermission('activos', 'read');

    const searchParams = request.nextUrl.searchParams;

    // Paginacion saneada: sin esto, ?page=abc daba NaN y reventaba en Prisma,
    // ?limit=999999 arrastraba la tabla entera y ?limit=0 devolvia
    // pages: Infinity. Un entero fuera de rango se corrige al limite, no
    // rechaza la peticion: el listado siempre responde algo utilizable.
    const enteroEnRango = (valor: string | null, pordefecto: number, minimo: number, maximo: number) => {
      const n = Number.parseInt(valor ?? "", 10);
      if (!Number.isFinite(n)) return pordefecto;
      return Math.min(Math.max(n, minimo), maximo);
    };

    const page = enteroEnRango(searchParams.get("page"), 1, 1, Number.MAX_SAFE_INTEGER);
    const limit = enteroEnRango(searchParams.get("limit"), 10, 1, LIMITE_MAXIMO_PAGINA);
    const search = searchParams.get("search") || "";
    const estado = searchParams.get("estado") || "";
    const categoriaId = searchParams.get("categoriaId") || "";
    const empleadoActualId = searchParams.get("empleadoActualId") || "";

    // Los registros descartados no aparecen en el listado (SPEC 2.7.7).
    const where: Record<string, unknown> = { ...ACTIVOS_VIGENTES };

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
              correoPersonal: true,
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
