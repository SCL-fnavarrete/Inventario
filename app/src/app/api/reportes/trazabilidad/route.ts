import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere } from '@/lib/auth/sedeScope';

export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('reportes', 'read');

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");

    if (!search) {
      return NextResponse.json(
        { error: "Par\u00e1metro de b\u00fasqueda requerido" },
        { status: 400 }
      );
    }

    // Buscar activo por n\u00famero de serie o IMEI. Antes no filtraba por
    // sede: un tecnico podia trazar cualquier activo de la empresa (2.24.1).
    const asset = await prisma.asset.findFirst({
      where: {
        AND: [
          sedeWhere(session),
          {
            OR: [
              { numeroSerie: { contains: search, mode: "insensitive" } },
              { imei: { contains: search, mode: "insensitive" } },
            ],
          },
        ],
      },
      include: {
        categoria: true,
        history: {
          orderBy: { createdAt: "desc" },
        },
        assignments: {
          orderBy: { fechaEntrega: "desc" },
          include: {
            employee: {
              select: {
                rut: true,
                nombres: true,
                apellidoPaterno: true,
              },
            },
          },
        },
        maintenances: {
          orderBy: { fechaProgramada: "desc" },
        },
      },
    });

    if (!asset) {
      return NextResponse.json(
        { error: "Activo no encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(asset);
  } catch (error) {
    return handleApiError(error, 'Error al buscar activo');
  }
}
