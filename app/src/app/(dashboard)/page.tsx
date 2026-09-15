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
 * Trae TODOS los datos del Resumen del Dashboard en un unico batch de
 * consultas paralelas (SPEC 2.16, 11-sep-2026).
 *
 * Antes esto eran dos funciones (`getStats` + `getAlertas`) llamadas una
 * despues de la otra (`await getStats(); await getAlertas();`), sin
 * necesidad -- ninguna depende del resultado de la otra, asi que esperaban
 * el doble de tiempo del que hacia falta. Ademas, entre las dos repetian la
 * misma consulta dos veces (el `OR` de Termination "pendiente" se pedia una
 * vez para contar y otra para listar los primeros 5) y el conteo de activos
 * por estado se hacia con 6 `count()` sueltos + hasta 4 `count()` más por
 * cada categoria para el grafico de stock (un N+1 clasico: con 7 categorias
 * son 28 consultas solo para ese grafico). Se unifica todo en un solo
 * `Promise.all` con 8 consultas fijas, sin importar cuantas categorias o
 * activos existan:
 *
 *  - El desglose de activos por estado (para las tarjetas KPI y el pie
 *    chart) y por categoria+estado (para "Stock por Categoria") salen de
 *    un unico `groupBy(["categoriaId", "estado"])`, agregado en memoria.
 *  - Mantenciones y Devoluciones pendientes se piden una sola vez cada una
 *    (sin el limite de 5 en la consulta) y se derivan en memoria tanto el
 *    conteo total como los primeros 5 de cada alerta -- mismo patron de
 *    "traer y filtrar en JS" que ya se usa en `/api/empleados` y
 *    `/api/asignaciones`.
 *  - "Asig. Ultimos 30 dias" ya no es una consulta aparte: se deriva
 *    filtrando en memoria el resultado de "Asignaciones ultimos 6 meses"
 *    (los 30 dias son un subconjunto de esos 6 meses).
 *  - Los conteos de empleados (`totalEmployees`/`activeEmployees`) se
 *    eliminan por completo: la tarjeta "Empleados Activos" que los usaba
 *    se reemplaza por "Equipos Vendidos" (ver mas abajo), y ningun otro
 *    lugar del Resumen los necesitaba.
 */
async function getDashboardData(session: SesionAutenticada, sedeIdFiltro: string | null) {
  // Aislamiento por sede (SPEC 2.9): admin ve todo el inventario, tecnico
  // solo lo de su sede. `sw` es el filtro directo (Asset/Employee/
  // WelcomeKitItem/WorkflowRequest tienen su propio sedeId); Maintenance y
  // Assignment no tienen sedeId propio y se filtran via su relacion a Asset.
  //
  // `swAsset` ahora tambien excluye activos con `deletedAt` (ACTIVOS_
  // VIGENTES) -- antes esto se aplicaba a todas las consultas de Asset pero
  // no a Mantenciones/Asignaciones, dejando pasar duplicados descartados de
  // una importacion (SPEC 2.7.7) en "Asig. Ultimos 30d" y en el grafico de
  // movimientos.
  // Filtro del selector de sede del nav (15-sep-2026, QA funcional, SPEC
  // 2.38). El Resumen ignoraba ese selector: con "Concepcion" elegido seguia
  // contando el inventario de Santiago, mientras Activos ya filtraba bien.
  // Como esto corre en el servidor (no hay localStorage), la sede llega por
  // cookie -- ver SedeSeleccionadaProvider.
  //
  // Igual que en /api/activos: solo se respeta para quien tiene visibilidad
  // total; para el resto manda sedeWhere(session), que no se puede pisar
  // con una cookie.
  const sw = {
    ...sedeWhere(session),
    ...(sedeIdFiltro && tieneVisibilidadTotal(session) ? { sedeId: sedeIdFiltro } : {}),
  };
  const swAsset = { asset: { ...sw, ...ACTIVOS_VIGENTES } };
  const swEmployee = { employee: sw };

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
    terminationsPendientesRaw,
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
      include: {
        asset: { select: { numeroSerie: true, marca: true, modelo: true } },
      },
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
    }),
  ]);

  // Desglose de activos por categoria + estado, agregado en memoria a
  // partir del groupBy: reemplaza los 6 count() sueltos por estado y los
  // hasta 4 count() por categoria que existian antes (SPEC 2.16).
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
  // Un activo vendido ya no forma parte del parque operativo -- por eso no
  // suma en las tarjetas de arriba ni en "Stock por Categoria" (esa logica
  // se mantiene tal cual, pedido explicito de Javier). Lo que faltaba era
  // poder ver CUANTO se ha vendido: tarjeta "Equipos Vendidos" (reemplaza a
  // "Empleados Activos") y la porcion "Vendidos" en el pie chart de abajo.
  const vendidoAssets = totalPorEstado("vendido");

  // "Activos por Categoria": total vigente por categoria, TODOS los
  // estados (antes salia de un `_count` de Prisma; ahora se suma a mano
  // desde el mismo groupBy de arriba, sin consulta adicional).
  const categories = categoriesRaw.map((cat) => {
    const conteos = conteosPorCategoria.get(cat.id) ?? {};
    const total = Object.values(conteos).reduce((acc, n) => acc + n, 0);
    return { id: cat.id, nombre: cat.nombre, stockMinimo: cat.stockMinimo, total };
  });

  // "Stock por Categoria" (grafico de barras apiladas): "vendido" queda
  // deliberadamente afuera (mismo criterio de arriba: un vendido no es
  // stock).
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

  // Alertas de stock de Activos (mismo concepto que Kit/EPP, pero sobre
  // los DISPONIBLES de cada categoria): sin stock es 0 disponibles; stock
  // bajo es cuando quedan pocos pero no cero, segun el umbral configurable
  // de cada categoria (stockMinimo, ver Configuracion > Categorias).
  // (15-sep-2026, SPEC 2.40) Este conteo era la razon de fondo para borrar
  // "reutilizable": los equipos devueltos y listos para entregar no se
  // contaban aqui, asi que el sistema avisaba "Sin Stock: Notebook" con
  // diez notebooks en bodega. Ahora esos equipos son "disponible".
  const sinStockCategorias = stockByCategory
    .filter((c) => c.disponibles === 0)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria }));
  const bajoStockCategorias = stockByCategory
    .filter((c) => c.disponibles > 0 && c.disponibles <= c.stockMinimo)
    .map((c) => ({ id: c.categoriaId, nombre: c.categoria, disponibles: c.disponibles, stockMinimo: c.stockMinimo }));

  // Estados para el pie chart: se agrega "vendido" (11-sep-2026, SPEC
  // 2.16) -- EstadosChart ya tenia la etiqueta "Vendidos" lista desde
  // antes, pero nadie le mandaba el dato, asi que ese estado nunca
  // aparecia en el grafico.
  const estadosData = [
    { estado: "disponible", cantidad: availableAssets, color: "#22c55e" },
    { estado: "asignado", cantidad: assignedAssets, color: "#3b82f6" },
    { estado: "en_mantencion", cantidad: maintenanceAssets, color: "#f97316" },
    { estado: "baja", cantidad: bajaAssets, color: "#ef4444" },
    { estado: "vendido", cantidad: vendidoAssets, color: "#6b7280" },
  ].filter((e) => e.cantidad > 0);

  // Mantenciones pendientes: se piden todas una sola vez (antes eran 3
  // consultas -- un count() y dos findMany() con take:5 -- todas con el
  // mismo `estado: "pendiente"`). Vencidas/Proximas/el total ahora se
  // derivan en memoria del mismo resultado.
  const pendingMaintenance = maintenancesPendientes.length;
  const mantencionesVencidas = maintenancesPendientes
    .filter((m) => m.fechaProgramada && m.fechaProgramada < today)
    .slice(0, 5);
  const mantencionesProximas = maintenancesPendientes
    .filter((m) => m.fechaProgramada && m.fechaProgramada >= today && m.fechaProgramada <= nextWeek)
    .slice(0, 5);

  // Devoluciones pendientes: mismo caso -- antes el mismo `OR` se pedia dos
  // veces (una para contar, otra para listar los primeros 5).
  const pendingTerminations = terminationsPendientesRaw.length;
  // Convert Decimal fields to numbers for Client Component compatibility
  const devolucionesPendientes = terminationsPendientesRaw.slice(0, 5).map((termination) => ({
    ...termination,
    montoDescuento: termination.montoDescuento
      ? termination.montoDescuento.toNumber()
      : null,
  }));

  // "Asig. Ultimos 30 dias" ya no es una consulta aparte: se deriva
  // filtrando en memoria "Asignaciones ultimos 6 meses" (los 30 dias son
  // un subconjunto de esos 6 meses, mismo `swAsset`).
  const recentAssignments = assignmentsUltimos6Meses.filter(
    (a) => a.fechaEntrega >= treintaDiasAtras
  ).length;

  // Agrupar asignaciones por mes para el grafico de movimientos
  const monthlyData: Record<
    string,
    { asignaciones: number; devoluciones: number }
  > = {};

  assignmentsUltimos6Meses.forEach((a) => {
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

  return {
    totalAssets,
    availableAssets,
    assignedAssets,
    maintenanceAssets,
    bajaAssets,
    vendidoAssets,
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
    mantencionesVencidas,
    mantencionesProximas,
    devolucionesPendientes,
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
    data.devolucionesPendientes.length +
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

      {/* Pestanas Resumen / Reportes (11-sep-2026, SPEC 2.15): el boton
          "Ver Reportes" que iba aca se elimino, ahora se navega por esta
          barra de pestanas -- ver DashboardTabs. */}
      <DashboardTabs />

      {/* Alertas: justo despues del titulo, para que lo primero que se ve al
          entrar sea lo que necesita atencion (mantenciones, devoluciones,
          stock de Kit/EPP y de Activos) */}
      <AlertsPanel
        mantencionesVencidas={data.mantencionesVencidas}
        mantencionesProximas={data.mantencionesProximas}
        devolucionesPendientes={data.devolucionesPendientes}
        sinStockItems={data.sinStockItems}
        bajoStockItems={data.bajoStockItems}
        sinStockCategorias={data.sinStockCategorias}
        bajoStockCategorias={data.bajoStockCategorias}
      />

      {/* Stats Grid - KPIs Principales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          {/* "Total Activos" cuenta TODOS los estados, incluido vendido --
              a proposito, para responder "cuantos activos hemos tenido en
              total". Las tarjetas de abajo (Disponibles..Baja) no suman a
              este total porque excluyen vendido; ver "Equipos Vendidos" en
              la segunda fila para ese numero. */}
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

      {/* Segunda fila de KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* "Empleados Activos" se reemplaza por "Equipos Vendidos"
            (11-sep-2026, SPEC 2.16, pedido explicito de Javier): un activo
            vendido ya no cuenta en ninguna tarjeta de arriba ni en "Stock
            por Categoria" (sale del parque operativo), asi que hacia falta
            un lugar donde ver cuantos se han vendido en total. */}
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
              <p className="text-xs text-gray-500">Devoluciones Pend.</p>
              <p className="text-2xl font-bold text-yellow-600">
                {data.pendingTerminations}
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

      {/* Activos por Categoria y stock de Kit de Bienvenida/EPP */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
