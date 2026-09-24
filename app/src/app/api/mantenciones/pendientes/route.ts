import { NextRequest, NextResponse } from "next/server";
import { Prisma } from '@prisma/client';
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { sedeWhere, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';
import { inicioDeHoy } from '@/lib/utils/fechas';

// GET /api/mantenciones/pendientes - Contadores de las tarjetas de resumen
// de Mantenciones (vencidas, proximas, en proceso, completadas). Solo cuenta:
// los listados salen de /api/mantenciones con sus filtros.
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;
    const dias = parseInt(searchParams.get("dias") || "30", 10);
    // Ventana de tiempo propia para el contador de "Completadas",
    // independiente de la ventana de "Proximas".
    const diasCompletadas = parseInt(searchParams.get("diasCompletadas") || "30", 10);
    // dias=0 / diasCompletadas=0 es el sentinel para "sin limite de fecha",
    // distinto de no mandar el parametro (que usa el default de 30).
    const sinLimiteProximas = dias === 0;
    const sinLimiteCompletadas = diasCompletadas === 0;

    // "Hoy" en hora de Chile, igual que el filtro de vencidas del listado:
    // las fechas programadas se guardan a medianoche UTC.
    const hoy = inicioDeHoy();
    const fechaLimite = new Date(hoy);
    fechaLimite.setUTCDate(fechaLimite.getUTCDate() + dias);
    const fechaInicioCompletadas = new Date(hoy);
    fechaInicioCompletadas.setUTCDate(fechaInicioCompletadas.getUTCDate() - diasCompletadas);

    // Maintenance no tiene sedeId propio -- se filtra via su relacion al
    // activo (mismo criterio que el listado y el Dashboard).
    const swAsset: { asset: Prisma.AssetWhereInput } = { asset: sedeWhere(session) };

    // Filtra por la sede seleccionada en el nav, igual que /api/mantenciones.
    const sedeIdFiltro = searchParams.get("sedeId") || "";
    if (sedeIdFiltro && tieneVisibilidadTotal(session)) {
      swAsset.asset = { ...swAsset.asset, sedeId: sedeIdFiltro };
    }

    const [totalVencidas, totalProximas, totalEnProceso, totalCompletadas] =
      await Promise.all([
        prisma.maintenance.count({
          // Vencidas: pendientes con la fecha pasada (una en proceso ya se
          // esta haciendo).
          where: { fechaProgramada: { lt: hoy }, estado: "pendiente", ...swAsset },
        }),
        prisma.maintenance.count({
          where: {
            // Proximas: pendientes por venir (las en proceso tienen su tarjeta).
            fechaProgramada: sinLimiteProximas ? { gte: hoy } : { gte: hoy, lte: fechaLimite },
            estado: "pendiente",
            ...swAsset,
          },
        }),
        prisma.maintenance.count({ where: { estado: "en_proceso", ...swAsset } }),
        // Cuenta por fechaRealizada (no fechaProgramada), dentro de la
        // ventana elegida.
        prisma.maintenance.count({
          where: {
            estado: "completada",
            ...(sinLimiteCompletadas ? {} : { fechaRealizada: { gte: fechaInicioCompletadas } }),
            ...swAsset,
          },
        }),
      ]);

    return NextResponse.json({
      stats: {
        totalVencidas,
        totalProximas,
        totalEnProceso,
        totalCompletadas,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones pendientes');
  }
}
