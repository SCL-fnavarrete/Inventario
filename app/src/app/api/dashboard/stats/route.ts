import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';
import { sedeWhere, tieneVisibilidadTotal } from '@/lib/auth/sedeScope';

// Filtra los KPIs del dashboard por sede para no exponer datos globales a
// un usuario sin visibilidad total.
export async function GET(request: NextRequest) {
  try {
    const session = await requirePermission('reportes', 'read');

    // Solo quien tiene visibilidad total puede acotar el dashboard a una
    // sede especifica via ?sedeId=.
    const sedeIdFiltro = request.nextUrl.searchParams.get("sedeId") || "";
    const sedeFiltro =
      sedeIdFiltro && tieneVisibilidadTotal(session)
        ? { sedeId: sedeIdFiltro }
        : sedeWhere(session);

    // KPIs principales
    const [
      totalAssets,
      availableAssets,
      assignedAssets,
      maintenanceAssets,
      bajaAssets,
      noDevueltoAssets,
      totalEmployees,
      activeEmployees,
      pendingMaintenance,
      recentAssignments,
      categories,
    ] = await Promise.all([
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sedeFiltro } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, estado: "disponible" } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, estado: "asignado" } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, estado: "en_mantencion" } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, estado: "baja" } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, estado: "no_devuelto" } }),
      prisma.employee.count({ where: sedeFiltro }),
      prisma.employee.count({ where: { ...sedeFiltro, estado: "activo" } }),
      prisma.maintenance.count({ where: { estado: "pendiente", asset: sedeFiltro } }),
      prisma.assignment.count({
        where: {
          fechaEntrega: {
            gte: new Date(new Date().setDate(new Date().getDate() - 30)),
          },
          asset: sedeFiltro,
        },
      }),
      prisma.assetCategory.findMany({
        include: {
          _count: {
            // Excluye los registros descartados y, si aplica, acota por sede.
            select: { assets: { where: { ...ACTIVOS_VIGENTES, ...sedeFiltro } } },
          },
        },
      }),
    ]);

    // Stock por categor\u00eda con estados
    const stockByCategory = await Promise.all(
      categories.map(async (cat) => {
        const [disponibles, asignados, mantencion, baja] = await Promise.all([
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, categoriaId: cat.id, estado: "disponible" },
          }),
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, categoriaId: cat.id, estado: "asignado" },
          }),
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, categoriaId: cat.id, estado: "en_mantencion" },
          }),
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, ...sedeFiltro, categoriaId: cat.id, estado: "baja" },
          }),
        ]);
        return {
          categoria: cat.nombre,
          disponibles,
          asignados,
          mantencion,
          baja,
        };
      })
    );

    // Estados para pie chart
    const estadosData = [
      { estado: "disponible", cantidad: availableAssets, color: "#22c55e" },
      { estado: "asignado", cantidad: assignedAssets, color: "#3b82f6" },
      { estado: "en_mantencion", cantidad: maintenanceAssets, color: "#f97316" },
      { estado: "no_devuelto", cantidad: noDevueltoAssets, color: "#ea580c" },
      { estado: "baja", cantidad: bajaAssets, color: "#ef4444" },
    ].filter((e) => e.cantidad > 0);

    // Asignaciones por mes (ultimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    // Sin visibilidad total, se une con assets para acotar por sede.
    // Prisma.sql/Prisma.empty evita interpolar un string SQL a mano.
    const filtroSedeSql = tieneVisibilidadTotal(session)
      ? Prisma.empty
      : Prisma.sql`AND assets.sede_id = ${session.user.sedeId ?? '__sin_sede_asignada__'}`;

    const asignacionesPorMes = await prisma.$queryRaw<
      { mes: string; asignaciones: bigint; devoluciones: bigint }[]
    >`
      SELECT
        TO_CHAR(assignments.fecha_entrega, 'YYYY-MM') as mes,
        COUNT(*) FILTER (WHERE assignments.activo = true OR assignments.fecha_devolucion IS NOT NULL) as asignaciones,
        COUNT(*) FILTER (WHERE assignments.fecha_devolucion IS NOT NULL) as devoluciones
      FROM assignments
      JOIN assets ON assets.id = assignments.asset_id
      WHERE assignments.fecha_entrega >= ${sixMonthsAgo}
      ${filtroSedeSql}
      GROUP BY TO_CHAR(assignments.fecha_entrega, 'YYYY-MM')
      ORDER BY mes
    `;

    const asignacionesChartData = asignacionesPorMes.map((row) => ({
      mes: row.mes,
      asignaciones: Number(row.asignaciones),
      devoluciones: Number(row.devoluciones),
    }));

    return NextResponse.json({
      kpis: {
        totalAssets,
        availableAssets,
        assignedAssets,
        maintenanceAssets,
        totalEmployees,
        activeEmployees,
        pendingMaintenance,
        recentAssignments,
      },
      stockByCategory,
      estadosData,
      asignacionesChartData,
      categories: categories.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        total: c._count.assets,
      })),
    });
  } catch (error) {
    return handleApiError(error, 'Error al obtener estad\u00edsticas');
  }
}
