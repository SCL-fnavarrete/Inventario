import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePermission, handleApiError } from '@/lib/auth/guard';
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

export async function GET() {
  try {
    await requirePermission('reportes', 'read');

    // KPIs principales
    const [
      totalAssets,
      availableAssets,
      assignedAssets,
      maintenanceAssets,
      bajaAssets,
      totalEmployees,
      activeEmployees,
      pendingMaintenance,
      pendingTerminations,
      recentAssignments,
      categories,
    ] = await Promise.all([
      prisma.asset.count({ where: ACTIVOS_VIGENTES }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, estado: "disponible" } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, estado: "asignado" } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, estado: "en_mantencion" } }),
      prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, estado: "baja" } }),
      prisma.employee.count(),
      prisma.employee.count({ where: { estado: "activo" } }),
      prisma.maintenance.count({ where: { estado: "pendiente" } }),
      prisma.termination.count({
        where: {
          OR: [
            { estadoNotebook: "pendiente" },
            { estadoCelular: "pendiente" },
            { estadoMonitor: "pendiente" },
          ],
        },
      }),
      prisma.assignment.count({
        where: {
          fechaEntrega: {
            gte: new Date(new Date().setDate(new Date().getDate() - 30)),
          },
        },
      }),
      prisma.assetCategory.findMany({
        include: {
          _count: {
            // Excluye los registros descartados (SPEC 2.7.7).
            select: { assets: { where: ACTIVOS_VIGENTES } },
          },
        },
      }),
    ]);

    // Stock por categor\u00eda con estados
    const stockByCategory = await Promise.all(
      categories.map(async (cat) => {
        const [disponibles, asignados, mantencion, baja] = await Promise.all([
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, categoriaId: cat.id, estado: "disponible" },
          }),
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, categoriaId: cat.id, estado: "asignado" },
          }),
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, categoriaId: cat.id, estado: "en_mantencion" },
          }),
          prisma.asset.count({
            where: { ...ACTIVOS_VIGENTES, categoriaId: cat.id, estado: "baja" },
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
      { estado: "baja", cantidad: bajaAssets, color: "#ef4444" },
    ].filter((e) => e.cantidad > 0);

    // Asignaciones por mes (ultimos 6 meses)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const asignacionesPorMes = await prisma.$queryRaw<
      { mes: string; asignaciones: bigint; devoluciones: bigint }[]
    >`
      SELECT
        TO_CHAR(fecha_entrega, 'YYYY-MM') as mes,
        COUNT(*) FILTER (WHERE activo = true OR fecha_devolucion IS NOT NULL) as asignaciones,
        COUNT(*) FILTER (WHERE fecha_devolucion IS NOT NULL) as devoluciones
      FROM assignments
      WHERE fecha_entrega >= ${sixMonthsAgo}
      GROUP BY TO_CHAR(fecha_entrega, 'YYYY-MM')
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
        pendingTerminations,
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
