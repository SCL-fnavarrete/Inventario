import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/prisma";
import { leerPaginacion } from "@/shared/utilidades/paginacion";
import { createAssetSchema } from "@/modules/activos/validaciones";
import { crearActivo } from "@/modules/activos/servicio";
import { requirePermission, handleApiError } from '@/shared/auth/guard';
import { sedeIdParaCrear } from '@/shared/sedes/filtro';
import { exigirSedeActiva } from "@/shared/sedes/consultas";
import { leerFiltrosActivos, whereFiltrosActivos } from '@/modules/activos/consultas';

/**
 * Tope de filas por pagina. Protege la base de un ?limit arbitrario;
 * 500 alcanza para las pantallas que traen una lista completa de una vez.
 */
const LIMITE_MAXIMO_PAGINA = 500;

export async function GET(request: NextRequest) {
  try {
    await requirePermission('activos', 'read');

    const searchParams = request.nextUrl.searchParams;

    const { page, limit } = leerPaginacion(searchParams, { limitMaximo: LIMITE_MAXIMO_PAGINA });
    const empleadoActualId = searchParams.get("empleadoActualId") || "";

    // Vigentes, estado, categoria, sede del menu, "Por
    // llegar", busqueda y datos de catalogo: los mismos filtros que la
    // exportacion y las tarjetas (SPEC 2.116.6).
    const where = whereFiltrosActivos(leerFiltrosActivos(searchParams));

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

    // La sede elegida en el formulario, obligatoria (SPEC 2.117).
    const sedeId = sedeIdParaCrear((body as { sedeId?: string }).sedeId, {
      requerido: true,
    });
    if (sedeId) await exigirSedeActiva(sedeId);

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
