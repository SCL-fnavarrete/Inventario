import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { sedeWhere, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';

// Filtra las alertas por sede para no exponer datos de equipos y empleados
// de otras sedes a un usuario sin visibilidad total.
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('reportes', 'read');

    const sedeIdFiltro = request.nextUrl.searchParams.get("sedeId") || "";
    const sedeFiltro =
      sedeIdFiltro && tieneVisibilidadTotal(session)
        ? { sedeId: sedeIdFiltro }
        : sedeWhere(session);

    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    // Mantenciones vencidas
    const mantencionesVencidas = await prisma.maintenance.findMany({
      where: {
        estado: "pendiente",
        fechaProgramada: {
          lt: today,
        },
        asset: sedeFiltro,
      },
      include: {
        asset: {
          select: {
            numeroSerie: true,
            marca: true,
            modelo: true,
          },
        },
      },
      take: 10,
    });

    // Mantenciones proximas (7 dias)
    const mantencionesProximas = await prisma.maintenance.findMany({
      where: {
        estado: "pendiente",
        fechaProgramada: {
          gte: today,
          lte: nextWeek,
        },
        asset: sedeFiltro,
      },
      include: {
        asset: {
          select: {
            numeroSerie: true,
            marca: true,
            modelo: true,
          },
        },
      },
      take: 10,
    });

    // Activos danados sin mantenimiento programado
    const activosDanados = await prisma.asset.findMany({
      where: {
        ...ACTIVOS_VIGENTES,
        ...sedeFiltro,
        condicion: "danado",
        NOT: {
          maintenances: {
            some: {
              estado: {
                in: ["pendiente", "en_proceso"],
              },
            },
          },
        },
      },
      select: {
        id: true,
        numeroSerie: true,
        marca: true,
        modelo: true,
        observaciones: true,
        categoria: {
          select: {
            nombre: true,
          },
        },
      },
      take: 10,
    });

    // Equipos con garantia por vencer (30 dias)
    const nextMonth = new Date();
    nextMonth.setDate(nextMonth.getDate() + 30);
    const garantiaPorVencer = await prisma.asset.findMany({
      where: {
        ...ACTIVOS_VIGENTES,
        ...sedeFiltro,
        fechaGarantiaFin: {
          gte: today,
          lte: nextMonth,
        },
        estado: {
          not: "baja",
        },
      },
      select: {
        id: true,
        numeroSerie: true,
        marca: true,
        modelo: true,
        fechaGarantiaFin: true,
      },
      take: 10,
    });

    const alertas: {
      tipo: string;
      categoria: string;
      mensaje: string;
      fecha: Date | null;
      link: string;
    }[] = [];

    // Construir alertas
    mantencionesVencidas.forEach((m) => {
      alertas.push({
        tipo: "error",
        categoria: "Mantención Vencida",
        mensaje: `${m.asset.marca} ${m.asset.modelo} (${m.asset.numeroSerie}) - ${m.descripcion}`,
        fecha: m.fechaProgramada,
        link: `/mantenciones/${m.id}`,
      });
    });

    mantencionesProximas.forEach((m) => {
      alertas.push({
        tipo: "warning",
        categoria: "Mantención Próxima",
        mensaje: `${m.asset.marca} ${m.asset.modelo} (${m.asset.numeroSerie}) - ${m.descripcion}`,
        fecha: m.fechaProgramada,
        link: `/mantenciones/${m.id}`,
      });
    });

    activosDanados.forEach((a) => {
      alertas.push({
        tipo: "error",
        categoria: "Equipo Dañado",
        mensaje: `${a.categoria?.nombre}: ${a.marca} ${a.modelo} (${a.numeroSerie})`,
        fecha: null,
        link: `/activos/${a.id}`,
      });
    });

    garantiaPorVencer.forEach((a) => {
      alertas.push({
        tipo: "info",
        categoria: "Garantía por Vencer",
        mensaje: `${a.marca} ${a.modelo} (${a.numeroSerie})`,
        fecha: a.fechaGarantiaFin,
        link: `/activos/${a.id}`,
      });
    });

    // Ordenar por tipo (errores primero) y fecha
    alertas.sort((a, b) => {
      const tipoOrden = { error: 0, warning: 1, info: 2 };
      const ordenA = tipoOrden[a.tipo as keyof typeof tipoOrden] ?? 3;
      const ordenB = tipoOrden[b.tipo as keyof typeof tipoOrden] ?? 3;
      if (ordenA !== ordenB) return ordenA - ordenB;
      if (a.fecha && b.fecha)
        return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
      return 0;
    });

    return NextResponse.json({
      alertas: alertas.slice(0, 20),
      resumen: {
        mantencionesVencidas: mantencionesVencidas.length,
        mantencionesProximas: mantencionesProximas.length,
        activosDanados: activosDanados.length,
        garantiaPorVencer: garantiaPorVencer.length,
      },
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener alertas');
  }
}
