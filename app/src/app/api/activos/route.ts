import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAssetSchema } from "@/lib/validations/asset";
import { assetHistoryService } from "@/lib/services/assetHistoryService";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere, sedeIdParaCrear, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

/**
 * Tope de filas por pagina. Protege la base de un ?limit arbitrario;
 * 500 porque SelectorActivos pide limit=200 para llenar su lista de una vez.
 */
const LIMITE_MAXIMO_PAGINA = 500;

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('activos', 'read');

    const searchParams = request.nextUrl.searchParams;

    // Paginacion saneada: un valor invalido o fuera de rango se corrige al
    // limite en vez de rechazar la peticion, para que el listado siempre
    // responda algo utilizable.
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

    // Los registros descartados no aparecen en el listado. Aislamiento por
    // sede: admin ve todo, el resto solo lo suyo.
    const where: Record<string, unknown> = { ...ACTIVOS_VIGENTES, ...sedeWhere(session) };

    if (search) {
      // Buscar por palabras, no por el texto completo: cada palabra debe
      // aparecer en alguno de los campos (no necesariamente el mismo), asi
      // que "Hp Probook 640 G2" matchea con marca="Hp" + modelo="ProBook 640
      // G2" aunque esten en columnas distintas.
      const palabras = search.trim().split(/\s+/).filter(Boolean);
      where.AND = palabras.map((palabra) => ({
        OR: [
          { numeroSerie: { contains: palabra, mode: "insensitive" } },
          { marca: { contains: palabra, mode: "insensitive" } },
          { modelo: { contains: palabra, mode: "insensitive" } },
          { nombreEquipo: { contains: palabra, mode: "insensitive" } },
        ],
      }));
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

    // Filtro explicito de sede por query param: solo tiene efecto para
    // admin, que puede acotar a una sede especifica. Para un tecnico se
    // ignora, su propia sede ya viene forzada por sedeWhere().
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      where.sedeId = sedeIdFiltro;
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
              // Se pide tambien el correo de empresa porque es el que las
              // pantallas muestran como identificador.
              correoEmpresa: true,
              correoPersonal: true,
              cargo: true
            },
          },
          sede: {
            select: { id: true, nombre: true },
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
          { error: "Ya existe un activo con este número de serie" },
          { status: 400 }
        );
      }
    }

    // La sede se hereda de quien crea el activo; admin debe elegirla
    // explicitamente, igual que un tecnico con la suya.
    const sedeId = sedeIdParaCrear(session, (body as { sedeId?: string }).sedeId, {
      requerido: true,
    });

    const asset = await prisma.asset.create({
      data: {
        categoriaId: validatedData.categoriaId,
        sedeId,
        marca: validatedData.marca,
        modelo: validatedData.modelo,
        numeroSerie: validatedData.numeroSerie || null,
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
        tipoLicenciaMicrosoft365: validatedData.tipoLicenciaMicrosoft365 || null,
        intuneEnrolled: validatedData.intuneEnrolled || false,
        listaDistribucion: validatedData.listaDistribucion || null,
        observaciones: validatedData.observaciones || null,
        antivirus: validatedData.antivirus || null,
        incidencia: validatedData.incidencia || null,
        nombreEquipo: validatedData.nombreEquipo || null,
        conectividad: validatedData.conectividad || null,
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
