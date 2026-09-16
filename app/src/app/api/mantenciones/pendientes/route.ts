import { NextRequest, NextResponse } from "next/server";
import { Prisma } from '@prisma/client';
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';

// GET /api/mantenciones/pendientes - Obtener mantenciones pendientes y próximas
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;
    const dias = parseInt(searchParams.get("dias") || "30", 10);
    // Ventana para "Completadas" (16-sep-2026, SPEC 2.51) -- antes ese
    // contador no tenia ventana de tiempo (contaba TODAS las completadas
    // de siempre, pese a que la tarjeta decia "(mes)"). Ahora usa su propio
    // periodo, independiente del de "Proximas".
    const diasCompletadas = parseInt(searchParams.get("diasCompletadas") || "30", 10);
    // "Todas" (18-sep-2026, SPEC 2.51.2): dias=0 / diasCompletadas=0 es el
    // sentinel que manda la pantalla para "sin limite de fecha" -- distinto
    // de no mandar el parametro (ese caso cae en el default de 30 de
    // arriba, para no romper otro consumidor futuro que no lo mande).
    const sinLimiteProximas = dias === 0;
    const sinLimiteCompletadas = diasCompletadas === 0;

    const hoy = new Date();
    const fechaLimite = new Date();
    fechaLimite.setDate(fechaLimite.getDate() + dias);
    const fechaInicioCompletadas = new Date();
    fechaInicioCompletadas.setDate(fechaInicioCompletadas.getDate() - diasCompletadas);

    // Maintenance no tiene sedeId propio -- se filtra via su relacion al
    // activo (mismo criterio que el listado y el Dashboard).
    const swAsset: { asset: Prisma.AssetWhereInput } = { asset: sedeWhere(session) };

    // Selector de sede del nav (16-sep-2026, SPEC 2.51): esta ruta no lo
    // respetaba -- a diferencia de /api/mantenciones, que si -- asi que las
    // tarjetas de arriba no cambiaban al elegir otra sede en el menu.
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      swAsset.asset = { ...swAsset.asset, sedeId: sedeIdFiltro };
    }

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

    // Obtener mantenciones próximas (en los próximos X días, o todas las
    // futuras si se pidió "sin límite").
    const proximas = await prisma.maintenance.findMany({
      where: {
        fechaProgramada: sinLimiteProximas ? { gte: hoy } : { gte: hoy, lte: fechaLimite },
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

    // Completadas en la ventana elegida (SPEC 2.51) -- por fechaRealizada,
    // no por fechaProgramada (una completada pudo programarse para otra
    // fecha y ejecutarse despues). Reemplaza el conteo de porEstado, que no
    // tenia ventana de tiempo.
    const totalCompletadas = await prisma.maintenance.count({
      where: {
        estado: "completada",
        ...(sinLimiteCompletadas ? {} : { fechaRealizada: { gte: fechaInicioCompletadas } }),
        ...swAsset,
      },
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
        totalCompletadas,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones pendientes');
  }
}
