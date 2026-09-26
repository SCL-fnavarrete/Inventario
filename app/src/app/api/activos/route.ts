import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAssetSchema } from "@/lib/validations/asset";
import { crearActivo } from "@/lib/services/activoService";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeIdParaCrear } from '@/lib/auth/sedeScope';
import { busquedaActivo, palabrasDeBusqueda, whereFiltrosActivos } from '@/lib/queries/activos';

/**
 * Tope de filas por pagina. Protege la base de un ?limit arbitrario;
 * 500 alcanza para las pantallas que traen una lista completa de una vez.
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
    const empleadoActualId = searchParams.get("empleadoActualId") || "";

    // Vigentes, sede de la sesion, estado, categoria, sede del menu y
    // "Por llegar": los mismos filtros que la exportacion.
    const where = whereFiltrosActivos(session, {
      estado: searchParams.get("estado") || "",
      categoriaId: searchParams.get("categoriaId") || "",
      sedeIdFiltro: searchParams.get("sedeId") || "",
      porLlegar: searchParams.get("porLlegar") === "1",
    });

    if (search) {
      // Por palabras: cada una debe aparecer en algun dato del activo o de
      // quien lo tiene ("Hp Probook 640 G2", "lenovo perez").
      where.AND = palabrasDeBusqueda(search).map(busquedaActivo);
    }

    if (empleadoActualId) {
      where.empleadoActualId = empleadoActualId;
    }

    const [assets, total] = await Promise.all([
      prisma.asset.findMany({
        where,
        include: {
          categoria: {
            select: { id: true, nombre: true, tipoFicha: true },
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

    // La sede se hereda de quien crea el activo; admin debe elegirla
    // explicitamente, igual que un tecnico con la suya.
    const sedeId = sedeIdParaCrear(session, (body as { sedeId?: string }).sedeId, {
      requerido: true,
    });

    // N° de serie e IMEI (unicos; IMEI obligatorio en celulares) e historial
    // de creacion: las mismas reglas que usan las compras (crearActivo).
    const asset = await prisma.$transaction((tx) =>
      crearActivo(tx, validatedData, { sedeId, usuario: session.user?.email || "sistema" })
    );

    return NextResponse.json(asset, { status: 201 });
  } catch (error) {
    return handleApiError(error, 'Error al crear activo');
  }
}
