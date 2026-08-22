import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';

// GET /api/mantenciones/pendientes - Obtener mantenciones pendientes y próximas
export async function GET(request: NextRequest) {
  try {
    await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;
    const dias = parseInt(searchParams.get("dias") || "30", 10);

    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + dias);

    // Obtener mantenciones vencidas (fecha pasada y pendiente/en_proceso)
    const vencidas = await prisma.maintenance.findMany({
      where: {
        fechaProgramada: { lt: hoy },
        estado: { in: ["pendiente", "en_proceso"] },
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
      _count: { estado: true },
    });

    const statsByTipo = await prisma.maintenance.groupBy({
      by: ["tipo"],
      where: {
        estado: { in: ["pendiente", "en_proceso"] },
      },
      _count: { tipo: true },
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
          tipo: s.tipo,
          count: s._count.tipo,
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
