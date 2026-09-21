import { cookies } from "next/headers";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type { SesionAutenticada } from "@/lib/auth/guard";
import { sedeWhere, tieneVisibilidadTotal } from "@/lib/auth/sedeScope";
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
  ClipboardList,
  DollarSign,
} from "lucide-react";
import Link from "next/link";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { DashboardTabs } from "@/components/dashboard/DashboardTabs";
import { ACTIVOS_VIGENTES } from '@/lib/queries/activos';

/**
 * Trae todos los datos del Resumen del Dashboard en un unico batch de
 * consultas paralelas para evitar round-trips secuenciales y duplicados.
 */
async function getDashboardData(session: SesionAutenticada, sedeIdFiltro: string | null) {
  // Aislamiento por sede: admin ve todo el inventario, tecnico solo lo de
  // su sede. `sw` es el filtro directo; Maintenance y Assignment no tienen
  // sedeId propio y se filtran via su relacion a Asset. `swAsset` tambien
  // excluye activos con `deletedAt` (ACTIVOS_VIGENTES).
  //
  // La sede elegida en el selector del nav llega por cookie (server
  // component, sin localStorage) y solo se respeta para quien tiene
  // visibilidad total; para el resto manda sedeWhere(session).
  const sw = {
    ...sedeWhere(session),
    ...(sedeIdFiltro && tieneVisibilidadTotal(session) ? { sedeId: sedeIdFiltro } : {}),
  };
  const swAsset = { asset: { ...sw, ...ACTIVOS_VIGENTES } };

  const today = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  const treintaDiasAtras = new Date();
  treintaDiasAtras.setDate(treintaDiasAtras.getDate() - 30);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const [
    totalAssets,
    assetsPorCategoriaYEstado,
    categoriesRaw,
    maintenancesPendientes,
    assignmentsUltimos6Meses,
    solicitudesAbiertas,
    kitItems,
  ] = await Promise.all([
    prisma.asset.count({ where: { ...ACTIVOS_VIGENTES, ...sw } }),
    prisma.asset.groupBy({
      by: ["categoriaId", "estado"],
      where: { ...ACTIVOS_VIGENTES, ...sw },
      _count: true,
    }),
    prisma.assetCategory.findMany({
      select: { id: true, nombre: true, stockMinimo: true },
    }),
    prisma.maintenance.findMany({
      where: { estado: "pendiente", ...swAsset },
      // Orden ascendente por fecha programada: la vencida mas antigua y
      // la proxima mas cercana aparecen primero.
      orderBy: { fechaProgramada: "asc" },
      include: {
        asset: {
          select: {
            numeroSerie: true,
            marca: true,
            modelo: true,
            sede: { select: { nombre: true } },
          },
        },
      },
    }),
    prisma.assignment.findMany({
      where: {
        fechaEntrega: { gte: sixMonthsAgo },
        ...swAsset,
      },
      select: {
        fechaEntrega: true,
        fechaDevolucion: true,
      },
    }),
    prisma.workflowRequest.count({
      where: { fechaCierre: null, ...sw },
    }),
    prisma.welcomeKitItem.findMany({
      where: sw,
      orderBy: { nombre: 'asc' },
      include: { sede: { select: { nombre: true } } },
    }),
  ]);

  // Desglose de activos por categoria + estado, agregado en memoria a
  // partir del groupBy.
  const conteosPorCategoria = new Map<string, Record<string, number>>();
  for (const fila of assetsPorCategoriaYEstado) {
    const actual = conteosPorCategoria.get(fila.categoriaId) ?? {};
    actual[fila.estado] = fila._count;
    conteosPorCategoria.set(fila.categoriaId, actual);
  }

  function totalPorEstado(estado: string): number {
    return assetsPorCategoriaYEstado
      .filter((fila) => fila.estado === estado)
      .reduce((acc, fila) => acc + fila._count, 0);
  }

  const availableAssets = totalPorEstado("disponible");
  const assignedAssets = totalPorEstado("asignado");
  const maintenanceAssets = totalPorEstado("en_mantencion");
  const bajaAssets = totalPorEstado("baja");
  // Un activo vendido ya no forma parte del parque operativo, por eso no
  // suma en las tarjetas de arriba ni en "Stock por Categoria".
  const vendidoAssets = totalPorEstado("vendido");

  // Equipos que quedaron en manos de alguien desvinculado que no los
  // devolvio; se cuentan aparte de "asignado".
  const noDevueltoAssets = totalPorEstado("no_devuelto");

  // "Activos por Categoria": total vigente por categoria, todos los
  // estados, sumado en memoria desde el groupBy de arriba.
  const categories = categoriesRaw.map((cat) => {
    const conteos = conteosPorCategoria.get(cat.id) ?? {};
    const total = Object.values(conteos).reduce((acc, n) => acc + n, 0);
    return { id: cat.id, nombre: cat.nombre, stockMinimo: cat.stockMinimo, total };
  });

  // "Stock por Categoria" (grafico de barras apiladas): "vendido" queda
  // fuera de este calculo porque no es stock disponible.
  const stockByCategory = categoriesRaw.map((cat) => {
    const conteos = conteosPorCategoria.get(cat.id) ?? {};
    return {
      categoriaId: cat.id,
      categoria: cat.nombre,
      stockMinimo: cat.stockMinimo,
      disponibles: conteos["disponible"] ?? 0,
      asignados: conteos["asignado"] ?? 0,
      mantencion: conteos["en_mantencion"] ?? 0,
      baja: conteos["baja"] ?? 0,
    };
  });

  // Alertas de stock de Activos, calculadas sobre los DISPONIBLES de cada
  // categoria: sin stock es 0 disponibles; stock bajo es cuando quedan
  // pocos segun el umbral configurable de cada categoria (stockMinimo).
  const sinStockCategorias = stockByCategory
    .filter((c) => c.disponibles === 0)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria }));
  const bajoStockCategorias = stockByCategory
    .filter((c) => c.disponibles > 0 && c.disponibles <= c.stockMinimo)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria, disponibles: c.disponibles, stockMinimo: c.stockMinimo }));

  // Estados para el pie chart, incluyendo "vendido".
  const estadosData = [
    { estado: "disponible", cantidad: availableAssets, color: "#22c55e" },
    { estado: "asignado", cantidad: assignedAssets, color: "#3b82f6" },
    { estado: "en_mantencion", cantidad: maintenanceAssets, color: "#f97316" },
    { estado: "no_devuelto", cantidad: noDevueltoAssets, color: "#ea580c" },
    { estado: "baja", cantidad: bajaAssets, color: "#ef4444" },
    { estado: "vendido", cantidad: vendidoAssets, color: "#6b7280" },
  ].filter((e) => e.cantidad > 0);

  // Mantenciones pendientes: se piden todas una sola vez y vencidas/
  // proximas/total se derivan en memoria del mismo resultado, sin limite
  // de cantidad (el panel es scrolleable).
  const pendingMaintenance = maintenancesPendientes.length;
  const mantencionesVencidas = maintenancesPendientes.filter(
    (m) => m.fechaProgramada && m.fechaProgramada < today
  );
  const mantencionesProximas = maintenancesPendientes.filter(
    (m) => m.fechaProgramada && m.fechaProgramada >= today && m.fechaProgramada <= nextWeek
  );

  // "Asig. Ultimos 30 dias" se deriva filtrando en memoria las
  // asignaciones de los ultimos 6 meses. El where de la consulta ya
  // excluye asignaciones sin fecha, por eso el non-null assertion es
  // seguro aunque TypeScript no pueda inferirlo.
  const recentAssignments = assignmentsUltimos6Meses.filter(
    (a) => a.fechaEntrega! >= treintaDiasAtras
  ).length;

  // Agrupar asignaciones por mes para el grafico de movimientos
  const monthlyData: Record<
    string,
    { asignaciones: number; devoluciones: number }
  > = {};

  assignmentsUltimos6Meses.forEach((a) => {
    const mes = a.fechaEntrega!.toISOString().slice(0, 7);
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
    .map((item) => ({ id: item.id, nombre: item.nombre, categoria: item.categoria, sedeNombre: item.sede?.nombre ?? null }));
  const bajoStockItems = kitItems
    .filter((item) => item.cantidad > 0 && item.cantidad <= item.stockMinimo)
    .map((item) => ({ id: item.id, nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad, stockMinimo: item.stockMinimo, sedeNombre: item.sede?.nombre ?? null }));

  return {
    totalAssets,
    availableAssets,
    assignedAssets,
    maintenanceAssets,
    bajaAssets,
    vendidoAssets,
    noDevueltoAssets,
    pendingMaintenance,
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
    mantencionesVencidas,
    mantencionesProximas,
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

export default async function DashboardPage() {
  // El middleware ya exige sesion para llegar aca (ver src/middleware.ts),
  // asi que el cast es seguro -- ver requireSession() en guard.ts, que hace
  // lo mismo para las rutas de API.
  const session = (await getServerSession(authOptions)) as SesionAutenticada;
  // Sede elegida en el selector del nav. Viaja por cookie porque este es un
  // server component (ver SedeSeleccionadaProvider); leerla ademas hace que
  // Next re-renderice el Resumen cuando cambia, en vez de servir una version
  // cacheada con los totales de otra sede.
  const sedeIdFiltro = (await cookies()).get("inventario-sede-seleccionada")?.value || null;
  const data = await getDashboardData(session, sedeIdFiltro);

  const totalAlertas =
    data.mantencionesVencidas.length +
    data.mantencionesProximas.length +
    data.sinStockItems.length +
    data.bajoStockItems.length +
    data.sinStockCategorias.length +
    data.bajoStockCategorias.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600">
          Bienvenido, {session?.user?.name}. Resumen del inventario IT.
        </p>
      </div>

      {/* Pestanas Resumen / Reportes */}
      <DashboardTabs />

      {/* Alertas: justo despues del titulo, para que lo primero que se ve al
          entrar sea lo que necesita atencion (mantenciones, devoluciones,
          stock de Kit/EPP y de Activos) */}
      <AlertsPanel
        mantencionesVencidas={data.mantencionesVencidas}
        mantencionesProximas={data.mantencionesProximas}
        sinStockItems={data.sinStockItems}
        bajoStockItems={data.bajoStockItems}
        sinStockCategorias={data.sinStockCategorias}
        bajoStockCategorias={data.bajoStockCategorias}
      />

      {/* Stats Grid - KPIs Principales. El salto de columnas ocurre en xl
          (1280px) para evitar que las tarjetas se achiquen justo cuando el
          Sidebar pasa a ocupar ancho fijo. */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          {/* "Total Activos" cuenta todos los estados, incluido vendido;
              las tarjetas de abajo excluyen vendido (ver "Equipos
              Vendidos" mas abajo). */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Total Activos</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.totalAssets}
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
                {data.availableAssets}
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
                {data.assignedAssets}
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
                {data.maintenanceAssets}
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
              <p className="text-xs text-gray-500">Baja</p>
              <p className="text-2xl font-bold text-red-600">{data.bajaAssets}</p>
            </div>
            <div className="p-2 bg-red-100 rounded-full">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Segunda fila de KPIs: Equipos Vendidos, Mantenciones Pend.,
          Asig. Ultimos 30d, Solicitudes Abiertas. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Cantidad de equipos vendidos: un activo vendido sale del
            parque operativo y no cuenta en las tarjetas ni en "Stock por
            Categoria". */}
        <Link href="/activos?estado=vendido" className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Equipos Vendidos</p>
              <p className="text-2xl font-bold text-gray-900">
                {data.vendidoAssets}
              </p>
            </div>
            <div className="p-2 bg-gray-100 rounded-full">
              <DollarSign className="h-5 w-5 text-gray-600" />
            </div>
          </div>
        </Link>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500">Mantenciones Pend.</p>
              <p className="text-2xl font-bold text-orange-600">
                {data.pendingMaintenance}
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
              <p className="text-xs text-gray-500">Asig. Últimos 30d</p>
              <p className="text-2xl font-bold text-blue-600">
                {data.recentAssignments}
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
                {data.solicitudesAbiertas}
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
        stockByCategory={data.stockByCategory}
        estadosData={data.estadosData}
        asignacionesChartData={data.asignacionesChartData}
      />

      {/* Activos por Categoria y stock de Kit de Bienvenida/EPP. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Activos por Categoría */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Activos por Categoría
            </h2>
            <div className="space-y-3">
              {data.categories.map((cat) => (
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
                    {cat.total}
                  </span>
                </div>
              ))}
              {data.categories.length === 0 && (
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
              {data.kitBienvenidaItems.map((item) => (
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
              {data.kitBienvenidaItems.length === 0 && (
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
              {data.eppItems.map((item) => (
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
              {data.eppItems.length === 0 && (
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
