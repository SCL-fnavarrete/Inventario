import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { inicioDeHoy } from '@/lib/utils/fechas';
import {
  VISTAS_MANTENCION,
  filtroPeriodo,
  ventanaPeriodo,
  whereSedeMantencion,
} from '@/lib/queries/mantenciones';

// GET /api/mantenciones/pendientes - Contadores de las tarjetas de resumen
// de Mantenciones. Cada tarjeta cuenta con la misma condicion que usa la
// lista al pulsarla (VISTAS_MANTENCION, SPEC 2.107), y "Total" con la del
// periodo sin mas filtros.
export async function GET(request: NextRequest) {
  try {
    await requirePermission('mantenciones', 'read');
    const searchParams = request.nextUrl.searchParams;
    // dias=0 / diasCompletadas=0 es "sin limite de fecha", distinto de no
    // mandar el parametro (que usa el default de 30).
    const dias = parseInt(searchParams.get("dias") || "30", 10);
    const diasCompletadas = parseInt(searchParams.get("diasCompletadas") || "30", 10);

    const ventana = ventanaPeriodo(inicioDeHoy(), dias, diasCompletadas);
    const sede = whereSedeMantencion(searchParams.get("sedeId"));
    const contar = (condicion: object | null) =>
      prisma.maintenance.count({ where: { AND: [sede, condicion ?? {}] } });

    const [totalVencidas, totalProximas, totalEnProceso, totalCompletadas, total] =
      await Promise.all([
        contar(VISTAS_MANTENCION.vencidas(ventana)),
        contar(VISTAS_MANTENCION.proximas(ventana)),
        contar(VISTAS_MANTENCION.en_proceso()),
        contar(VISTAS_MANTENCION.completadas(ventana)),
        contar(filtroPeriodo(ventana)),
      ]);

    return NextResponse.json({
      stats: { totalVencidas, totalProximas, totalEnProceso, totalCompletadas, total },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener mantenciones pendientes');
  }
}
