import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get("search");

    if (!search) {
      return NextResponse.json(
        { error: "Par\u00e1metro de b\u00fasqueda requerido" },
        { status: 400 }
      );
    }

    // Buscar activo por n\u00famero de serie o IMEI
    const asset = await prisma.asset.findFirst({
      where: {
        OR: [
          { numeroSerie: { contains: search, mode: "insensitive" } },
          { imei: { contains: search, mode: "insensitive" } },
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
    console.error("Error en trazabilidad:", error);
    return NextResponse.json(
      { error: "Error al buscar activo" },
      { status: 500 }
    );
  }
}
