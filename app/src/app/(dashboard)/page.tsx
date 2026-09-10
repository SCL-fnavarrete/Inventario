import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SesionAutenticada } from "@/lib/auth/guard";
import { sedeWhere } from "@/lib/auth/sedeScope";
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
  ClipboardList,
} from "lucide-react";
import Link from "next/link";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

async function getStats(session: SesionAutenticada) {
  // Aislamiento por sede (SPEC 2.9): admin ve todo el inventario, tecnico
  // solo lo de su sede. `sw` es el filtro directo (Asset/Employee/
  // WelcomeKitItem/WorkflowRequest tienen su propio sedeId); Maintenance,
  // Termination y Assignment no tienen sedeId propio y se filtran a traves
  // de su relacion (asset/employee).
  const sw = sedeWhere(session);
  const swAsset = { asset: sw };
  const swEmployee = { employee: sw };

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
    solicitudesAbiertas,
    kitItems,
  ] = await Promise.all([
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw } }),
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw, estado: "disponible" } }),
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw, estado: "asignado" } }),
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw, estado: "en_mantencion" } }),
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw, estado: "baja" } }),
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw, estado: "reutilizable" } }),
    prisma.employee.count({ where: sw }),
    prisma.employee.count({ where: { ...sw, estado: "activo" } }),
    prisma.maintenance.count({ where: { estado: "pendiente", ...swAsset } }),
    prisma.termination.count({
      where: {
        OR: [
          { estadoNotebook: "pendiente" },
          { estadoCelular: "pendiente" },
          { estadoMonitor: "pendiente" },
        ],
        ...swEmployee,
      },
    }),
    prisma.assignment.count({
      where: {
        fechaEntrega: {
          gte: new Date(new Date().setDate(new Date().getDate() - 30)),
        },
        ...swAsset,
      },
    }),
    prisma.assetCategory.findMany({
      include: {
        _count: {
          // Excluye los registros descartados (SPEC 2.7.7) y aplica el
          // aislamiento por sede: el conteo por categoria tambien debe
          // reflejar solo la sede del tecnico.
          select: { assets: { where: { ...ACTIVOS_VIGENTES, ...sw } } },
        },
      },
    }),
    prisma.workflowRequest.count({
      where: { fechaCierre: null, ...sw },
    }),
    prisma.welcomeKitItem.findMany({
      where: sw,
      orderBy: { nombre: 'asc' },
    }),
  ]);

  // Stock de Kit de Bienvenida y EPP, separados por categoria (reemplaza el
  // bloque de Acciones Rapidas: esto es lo que en la practica se revisa antes
  // de coordinar una entrega).
  const kitBienvenidaItems = kitItems
    .filter((item) => item.categoria === 'kit_bienvenida')
    .map((item) => ({ id: item.id, nombre: item.nombre, cantidad: item.cantidad, stockMinimo: item.stockMinimo }));
  const eppItems = kitItems
    .filter((item) => item.categoria === 'epp')
    .map((item) => ({ id: item.id, nombre: item.nombre, cantidad: item.cantidad, stockMinimo: item.stockMinimo }));

  // Alertas de stock (reemplazan la alerta de "Equipos Danados"): sin stock
  // es cantidad 0; stock bajo es cuando llega al umbral configurable de cada
  // articulo (stockMinimo, ver Configuracion > Kit y EPP) pero todavia queda
  // algo. Un articulo en 0 cuenta solo como "sin stock", no en ambas.
  const sinStockItems = kitItems
    .filter((item) => item.cantidad === 0)
    .map((item) => ({ id: item.id, nombre: item.nombre, categoria: item.categoria }));
  const bajoStockItems = kitItems
    .filter((item) => item.cantidad > 0 && item.cantidad <= item.stockMinimo)
    .map((item) => ({ id: item.id, nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad, stockMinimo: item.stockMinimo }));

  // Stock por categoría con estados
  const stockByCategory = await Promise.all(
    categories.map(async (cat) => {
      const [disponibles, asignados, mantencion, baja] = await Promise.all([
        prisma.asset.count({
          where: { ...ACTIVOS_VIGENTES, ...sw, categoriaId: cat.id, estado: "disponible" },
        }),
        prisma.asset.count({
          where: { ...ACTIVOS_VIGENTES, ...sw, categoriaId: cat.id, estado: "asignado" },
        }),
        prisma.asset.count({
          where: { ...ACTIVOS_VIGENTES, ...sw, categoriaId: cat.id, estado: "en_mantencion" },
        }),
        prisma.asset.count({
          where: { ...ACTIVOS_VIGENTES, ...sw, categoriaId: cat.id, estado: "baja" },
        }),
      ]);
      return {
        categoriaId: cat.id,
        categoria: cat.nombre,
        stockMinimo: cat.stockMinimo,
        disponibles,
        asignados,
        mantencion,
        baja,
      };
    })
  );

  // Alertas de stock de Activos (mismo concepto que Kit/EPP, pero sobre
  // los DISPONIBLES de cada categoria): sin stock es 0 disponibles; stock
  // bajo es cuando quedan pocos pero no cero, segun el umbral configurable
  // de cada categoria (stockMinimo, ver Configuracion > Categorias).
  const sinStockCategorias = stockByCategory
    .filter((c) => c.disponibles === 0)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria }));
  const bajoStockCategorias = stockByCategory
    .filter((c) => c.disponibles > 0 && c.disponibles <= c.stockMinimo)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria, disponibles: c.disponibles, stockMinimo: c.stockMinimo }));

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
      ...swAsset,
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
    solicitudesAbiertas,
    kitBienvenidaItems,
    eppItems,
    sinStockCategorias,
    bajoStockCategorias,
    sinStockItems,
    bajoStockItems,
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

async function getAlertas(session: SesionAutenticada) {
  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  // Mismo aislamiento por sede que getStats(): Maintenance/Termination no
  // tienen sedeId propio, se filtran via su relacion a Asset/Employee.
  const sw = sedeWhere(session);
  const swAsset = { asset: sw };
  const swEmployee = { employee: sw };

  const [
    mantencionesVencidas,
    mantencionesProximas,
    devolucionesPendientesRaw,
  ] = await Promise.all([
    prisma.maintenance.findMany({
      where: {
        estado: "pendiente",
        fechaProgramada: { lt: today },
        ...swAsset,
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
        ...swAsset,
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
        ...swEmployee,
      },
      include: {
        employee: { select: { rut: true, nombres: true, apellidoPaterno: true } },
      },
      take: 5,
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
  };
}

export default async function DashboardPage() {
  // El middleware ya exige sesion para llegar aca (ver src/middleware.ts),
  // asi que el cast es seguro -- ver requireSession() en guard.ts, que hace
  // lo mismo para las rutas de API.
  const session = (await getServerSession(authOptions)) as SesionAutenticada;
  const stats = await getStats(session);
  const alertas = await getAlertas(session);

  const totalAlertas =
    alertas.mantencionesVencidas.length +
    alertas.mantencionesProximas.length +
    alertas.devolucionesPendientes.length +
    stats.sinStockItems.length +
    stats.bajoStockItems.length +
    stats.sinStockCategorias.length +
    stats.bajoStockCategorias.length;

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

      {/* Alertas: justo despues del titulo, para que lo primero que se ve al
          entrar sea lo que necesita atencion (mantenciones, devoluciones,
          stock de Kit/EPP y de Activos) */}
      <AlertsPanel
        mantencionesVencidas={alertas.mantencionesVencidas}
        mantencionesProximas={alertas.mantencionesProximas}
        devolucionesPendientes={alertas.devolucionesPendientes}
        sinStockItems={stats.sinStockItems}
        bajoStockItems={stats.bajoStockItems}
        sinStockCategorias={stats.sinStockCategorias}
        bajoStockCategorias={stats.bajoStockCategorias}
      />

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Link href="/activos/empleados" className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
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
        </Link>

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

        <Link href="/solicitudes" className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Solicitudes Abiertas</p>
              <p className="text-2xl font-bold text-indigo-600">
                {stats.solicitudesAbiertas}
              </p>
            </div>
            <div className="p-2 bg-indigo-100 rounded-full">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
            </div>
          </div>
        </Link>
      </div>

      {/* Gráficos */}
      <DashboardCharts
        stockByCategory={stats.stockByCategory}
        estadosData={stats.estadosData}
        asignacionesChartData={stats.asignacionesChartData}
      />

      {/* Activos por Categoria y stock de Kit de Bienvenida/EPP */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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

          {/* Kit de Bienvenida */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Kit de Bienvenida
            </h2>
            <div className="space-y-3">
              {stats.kitBienvenidaItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-gray-700">{item.nombre}</span>
                  <span
                    className={
                      item.cantidad === 0
                        ? "font-semibold text-red-600"
                        : item.cantidad <= item.stockMinimo
                        ? "font-semibold text-orange-600"
                        : "font-semibold text-gray-900"
                    }
                  >
                    {item.cantidad}
                  </span>
                </div>
              ))}
              {stats.kitBienvenidaItems.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No hay artículos registrados
                </p>
              )}
            </div>
          </div>

          {/* EPP */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">EPP</h2>
            <div className="space-y-3">
              {stats.eppItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-gray-700">{item.nombre}</span>
                  <span
                    className={
                      item.cantidad === 0
                        ? "font-semibold text-red-600"
                        : item.cantidad <= item.stockMinimo
                        ? "font-semibold text-orange-600"
                        : "font-semibold text-gray-900"
                    }
                  >
                    {item.cantidad}
                  </span>
                </div>
              ))}
              {stats.eppItems.length === 0 && (
                <p className="text-gray-500 text-center py-4">
                  No hay artículos registrados
                </p>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
