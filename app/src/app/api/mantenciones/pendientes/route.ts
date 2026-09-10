import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere } from '@/lib/auth/sedeScope';

// GET /api/mantenciones/pendientes - Obtener mantenciones pendientes y próximas
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;
    const dias = parseInt(searchParams.get("dias") || "30", 10);

    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + dias);

    // Maintenance no tiene sedeId propio -- se filtra via su relacion al
    // activo (mismo criterio que el listado y el Dashboard).
    const swAsset = { asset: sedeWhere(session) };

    // Obtener mantenciones vencidas (fecha pasada y pendiente/en_proceso)
    const vencidas = await prisma.maintenance.findMany({
      where: {
        fechaProgramada: { lt: hoy },
        estado: { in: ["pendiente", "en_proceso"] },
        ...swAsset,
      },
      include: {
        asset: {
          include: {
            categoria: true,
            empleadoActual: {
              select: {
                id: true,
                rut: true,
                nombres: true,
                apellidoPaterno: true,
              },
            },
          },
        },
      },
      orderBy: { fechaProgramada: "asc" },
    });

    // Obtener mantenciones próximas (en los próximos X días)
    const proximas = await prisma.maintenance.findMany({
      where: {
        fechaProgramada: {
          gte: hoy,
          lte: fechaLimite,
        },
        estado: { in: ["pendiente", "en_proceso"] },
        ...swAsset,
      },
      include: {
        asset: {
          include: {
            categoria: true,
            empleadoActual: {
              select: {
                id: true,
                rut: true,
                nombres: true,
                apellidoPaterno: true,
              },
            },
          },
        },
      },
      orderBy: { fechaProgramada: "asc" },
    });

    // Obtener mantenciones en proceso
    const enProceso = await prisma.maintenance.findMany({
      where: {
        estado: "en_proceso",
        ...swAsset,
      },
      include: {
        asset: {
          include: {
            categoria: true,
            empleadoActual: {
              select: {
                id: true,
                rut: true,
                nombres: true,
                apellidoPaterno: true,
              },
            },
          },
        },
      },
      orderBy: { fechaProgramada: "asc" },
    });

    // Estadísticas
    const stats = await prisma.maintenance.groupBy({
      by: ["estado"],
      where: swAsset,
      _count: { estado: true },
    });

    const statsByTipo = await prisma.maintenance.groupBy({
      by: ["tipoId"],
      where: {
        estado: { in: ["pendiente", "en_proceso"] },
        ...swAsset,
      },
      _count: { tipoId: true },
    });

    return NextResponse.json({
      vencidas,
      proximas,
      enProceso,
      stats: {
        porEstado: stats.map((s) => ({
          estado: s.estado,
          count: s._count.estado,
        })),
        porTipo: statsByTipo.map((s) => ({
          tipoId: s.tipoId,
          count: s._count.tipoId,
        })),
        totalVencidas: vencidas.length,
        totalProximas: proximas.length,
        totalEnProceso: enProceso.length,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones pendientes');
  }
}
