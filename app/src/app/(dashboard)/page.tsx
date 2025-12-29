import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  Laptop,
  Smartphone,
  Monitor,
  Users,
  AlertTriangle,
  CheckCircle,
  Wrench,
  TrendingUp,
  Clock,
  XCircle,
  Package,
  FileText,
} from "lucide-react";
import Link from "next/link";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";

async function getStats() {
  const [
    totalAssets,
    availableAssets,
    assignedAssets,
    maintenanceAssets,
    bajaAssets,
    reutilizableAssets,
    totalEmployees,
    activeEmployees,
    pendingMaintenance,
    pendingTerminations,
    recentAssignments,
    categories,
  ] = await Promise.all([
    prisma.asset.count(),
    prisma.asset.count({ where: { estado: "disponible" } }),
    prisma.asset.count({ where: { estado: "asignado" } }),
    prisma.asset.count({ where: { estado: "en_mantencion" } }),
    prisma.asset.count({ where: { estado: "baja" } }),
    prisma.asset.count({ where: { estado: "reutilizable" } }),
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
          select: { assets: true },
        },
      },
    }),
  ]);

  // Stock por categoría con estados
  const stockByCategory = await Promise.all(
    categories.map(async (cat) => {
      const [disponibles, asignados, mantencion, baja] = await Promise.all([
        prisma.asset.count({
          where: { categoriaId: cat.id, estado: "disponible" },
        }),
        prisma.asset.count({
          where: { categoriaId: cat.id, estado: "asignado" },
        }),
        prisma.asset.count({
          where: { categoriaId: cat.id, estado: "en_mantencion" },
        }),
        prisma.asset.count({
          where: { categoriaId: cat.id, estado: "baja" },
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
    { estado: "reutilizable", cantidad: reutilizableAssets, color: "#8b5cf6" },
    { estado: "baja", cantidad: bajaAssets, color: "#ef4444" },
  ].filter((e) => e.cantidad > 0);

  // Asignaciones últimos 6 meses (simplificado)
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const assignments = await prisma.assignment.findMany({
    where: {
      fechaEntrega: {
        gte: sixMonthsAgo,
      },
    },
    select: {
      fechaEntrega: true,
      fechaDevolucion: true,
    },
  });

  // Agrupar por mes
  const monthlyData: Record<
    string,
    { asignaciones: number; devoluciones: number }
  > = {};

  assignments.forEach((a) => {
    const mes = a.fechaEntrega.toISOString().slice(0, 7);
    if (!monthlyData[mes]) {
      monthlyData[mes] = { asignaciones: 0, devoluciones: 0 };
    }
    monthlyData[mes].asignaciones++;

    if (a.fechaDevolucion) {
      const mesDev = a.fechaDevolucion.toISOString().slice(0, 7);
      if (!monthlyData[mesDev]) {
        monthlyData[mesDev] = { asignaciones: 0, devoluciones: 0 };
      }
      monthlyData[mesDev].devoluciones++;
    }
  });

  const asignacionesChartData = Object.entries(monthlyData)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([mes, data]) => ({
      mes: formatMonth(mes),
      asignaciones: data.asignaciones,
      devoluciones: data.devoluciones,
    }));

  return {
    totalAssets,
    availableAssets,
    assignedAssets,
    maintenanceAssets,
    bajaAssets,
    reutilizableAssets,
    totalEmployees,
    activeEmployees,
    pendingMaintenance,
    pendingTerminations,
    recentAssignments,
    categories,
    stockByCategory,
    estadosData,
    asignacionesChartData,
  };
}

function formatMonth(mes: string): string {
  const [year, month] = mes.split("-");
  const months = [
    "Ene",
    "Feb",
    "Mar",
    "Abr",
    "May",
    "Jun",
    "Jul",
    "Ago",
    "Sep",
    "Oct",
    "Nov",
    "Dic",
  ];
  return `${months[parseInt(month) - 1]} ${year.slice(2)}`;
}

async function getAlertas() {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const [
    mantencionesVencidas,
    mantencionesProximas,
    devolucionesPendientesRaw,
    activosDanados,
  ] = await Promise.all([
    prisma.maintenance.findMany({
      where: {
        estado: "pendiente",
        fechaProgramada: { lt: today },
      },
      include: {
        asset: { select: { numeroSerie: true, marca: true, modelo: true } },
      },
      take: 5,
    }),
    prisma.maintenance.findMany({
      where: {
        estado: "pendiente",
        fechaProgramada: { gte: today, lte: nextWeek },
      },
      include: {
        asset: { select: { numeroSerie: true, marca: true, modelo: true } },
      },
      take: 5,
    }),
    prisma.termination.findMany({
      where: {
        OR: [
          { estadoNotebook: "pendiente" },
          { estadoCelular: "pendiente" },
          { estadoMonitor: "pendiente" },
        ],
      },
      include: {
        employee: { select: { rut: true, nombres: true, apellidoPaterno: true } },
      },
      take: 5,
    }),
    prisma.asset.count({
      where: { condicion: "danado" },
    }),
  ]);

  // Convert Decimal fields to numbers for Client Component compatibility
  const devolucionesPendientes = devolucionesPendientesRaw.map((termination) => ({
    ...termination,
    montoDescuento: termination.montoDescuento
      ? termination.montoDescuento.toNumber()
      : null,
  }));

  return {
    mantencionesVencidas,
    mantencionesProximas,
    devolucionesPendientes,
    activosDanados,
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const stats = await getStats();
  const alertas = await getAlertas();

  const totalAlertas =
    alertas.mantencionesVencidas.length +
    alertas.mantencionesProximas.length +
    alertas.devolucionesPendientes.length +
    (alertas.activosDanados > 0 ? 1 : 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">
            Bienvenido, {session?.user?.name}. Resumen del inventario IT.
          </p>
        </div>
        <Link
          href="/reportes"
          className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <FileText className="h-4 w-4" />
          Ver Reportes
        </Link>
      </div>

      {/* Stats Grid - KPIs Principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Activos</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.totalAssets}
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Disponibles</p>
              <p className="text-2xl font-bold text-green-600">
                {stats.availableAssets}
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Asignados</p>
              <p className="text-2xl font-bold text-blue-600">
                {stats.assignedAssets}
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">En Mantención</p>
              <p className="text-2xl font-bold text-orange-600">
                {stats.maintenanceAssets}
              </p>
            </div>
            <div className="p-2 bg-orange-100 rounded-full">
              <Wrench className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Reutilizables</p>
              <p className="text-2xl font-bold text-purple-600">
                {stats.reutilizableAssets}
              </p>
            </div>
            <div className="p-2 bg-purple-100 rounded-full">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Baja</p>
              <p className="text-2xl font-bold text-red-600">{stats.bajaAssets}</p>
            </div>
            <div className="p-2 bg-red-100 rounded-full">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Segunda fila de KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Empleados Activos</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.activeEmployees}
                <span className="text-sm text-gray-500 font-normal">
                  /{stats.totalEmployees}
                </span>
              </p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <Users className="h-5 w-5 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Mantenciones Pend.</p>
              <p className="text-2xl font-bold text-orange-600">
                {stats.pendingMaintenance}
              </p>
            </div>
            <div className="p-2 bg-orange-100 rounded-full">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Devoluciones Pend.</p>
              <p className="text-2xl font-bold text-yellow-600">
                {stats.pendingTerminations}
              </p>
            </div>
            <div className="p-2 bg-yellow-100 rounded-full">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Asig. Últimos 30d</p>
              <p className="text-2xl font-bold text-blue-600">
                {stats.recentAssignments}
              </p>
            </div>
            <div className="p-2 bg-blue-100 rounded-full">
              <TrendingUp className="h-5 w-5 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Gráficos */}
      <DashboardCharts
        stockByCategory={stats.stockByCategory}
        estadosData={stats.estadosData}
        asignacionesChartData={stats.asignacionesChartData}
      />

      {/* Alertas y Acciones Rápidas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel de Alertas */}
        <AlertsPanel
          mantencionesVencidas={alertas.mantencionesVencidas}
          mantencionesProximas={alertas.mantencionesProximas}
          devolucionesPendientes={alertas.devolucionesPendientes}
          activosDanados={alertas.activosDanados}
        />

        {/* Acciones Rápidas y Categorías */}
        <div className="space-y-6">
          {/* Activos por Categoría */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Activos por Categoría
            </h2>
            <div className="space-y-3">
              {stats.categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {cat.nombre === "Notebook" && (
                      <Laptop className="h-5 w-5 text-gray-500" />
                    )}
                    {cat.nombre === "Celular" && (
                      <Smartphone className="h-5 w-5 text-gray-500" />
                    )}
                    {cat.nombre === "Monitor" && (
                      <Monitor className="h-5 w-5 text-gray-500" />
                    )}
                    {!["Notebook", "Celular", "Monitor"].includes(cat.nombre) && (
                      <Package className="h-5 w-5 text-gray-500" />
                    )}
                    <span className="text-gray-700">{cat.nombre}</span>
                  </div>
                  <span className="font-semibold text-gray-900">
                    {cat._count.assets}
                  </span>
                </div>
              ))}
              {stats.categories.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No hay activos registrados
                </p>
              )}
            </div>
          </div>

          {/* Acciones Rápidas */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Acciones Rápidas
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                href="/activos/nuevo"
                className="flex flex-col items-center p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <Laptop className="h-6 w-6 text-blue-600 mb-1" />
                <span className="text-xs font-medium text-blue-900">
                  Nuevo Activo
                </span>
              </Link>
              <Link
                href="/empleados/nuevo"
                className="flex flex-col items-center p-3 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
              >
                <Users className="h-6 w-6 text-green-600 mb-1" />
                <span className="text-xs font-medium text-green-900">
                  Nuevo Empleado
                </span>
              </Link>
              <Link
                href="/asignaciones/nueva"
                className="flex flex-col items-center p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <CheckCircle className="h-6 w-6 text-purple-600 mb-1" />
                <span className="text-xs font-medium text-purple-900">
                  Nueva Asignación
                </span>
              </Link>
              <Link
                href="/mantenciones/programar"
                className="flex flex-col items-center p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <Wrench className="h-6 w-6 text-orange-600 mb-1" />
                <span className="text-xs font-medium text-orange-900">
                  Programar Mant.
                </span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
