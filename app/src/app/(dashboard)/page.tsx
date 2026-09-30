import { getServerSession } from "next-auth";
import { authOptions } from "@/shared/auth/opciones";
import type { SesionAutenticada } from "@/shared/auth/guard";
import { leerSedeFiltroDesdeCookie } from "@/shared/sedes/cookie";
import { resumenDashboard } from "@/modules/dashboard/servidor";
import {
  Users,
  CheckCircle,
  Wrench,
  TrendingUp,
  Clock,
  XCircle,
  Package,
  ClipboardList,
  DollarSign,
  UserX,
} from "lucide-react";
import { DashboardCharts, AlertsPanel } from "@/modules/dashboard/componentes";
import { CategoryIcon } from "@/modules/activos/componentes";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";
import { ESTADO_ACTIVO_TONO } from "@/shared/constantes/tonos";

export default async function DashboardPage() {
  // El proxy ya exige sesion para llegar aca (ver src/proxy.ts),
  // asi que el cast es seguro -- ver requireSession() en guard.ts, que hace
  // lo mismo para las rutas de API.
  const session = (await getServerSession(authOptions)) as SesionAutenticada;
  const sedeIdFiltro = await leerSedeFiltroDesdeCookie();
  const data = await resumenDashboard(sedeIdFiltro);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description={`Bienvenido, ${session?.user?.name ?? ""}. Resumen del inventario IT.`}
      />

      {/* Alertas: justo despues del titulo, para que lo primero que se ve al
          entrar sea lo que necesita atencion (mantenciones, devoluciones,
          stock de Kit/EPP y de Activos) */}
      <AlertsPanel
        mantencionesVencidas={data.mantencionesVencidas}
        mantencionesProximas={data.mantencionesProximas}
        totalVencidas={data.totalVencidas}
        totalProximas={data.totalProximas}
        sinStockItems={data.sinStockItems}
        bajoStockItems={data.bajoStockItems}
        sinStockCategorias={data.sinStockCategorias}
        bajoStockCategorias={data.bajoStockCategorias}
      />

      {/* KPIs principales. "Total Activos" cuenta todos los estados, incluido
          vendido; las demas tarjetas excluyen vendido (ver "Equipos Vendidos"). */}
      <StatGrid cols={6}>
        <StatCard tilt label="Total Activos" value={data.totalAssets} tone="primary" icon={Package} href="/activos" />
        <StatCard tilt label="Disponibles" value={data.availableAssets} tone={ESTADO_ACTIVO_TONO.disponible} icon={CheckCircle} href="/activos?estado=disponible" />
        <StatCard tilt label="Asignados" value={data.assignedAssets} tone={ESTADO_ACTIVO_TONO.asignado} icon={Users} href="/activos?estado=asignado" />
        <StatCard tilt label="En Mantención" value={data.maintenanceAssets} tone={ESTADO_ACTIVO_TONO.en_mantencion} icon={Wrench} href="/activos?estado=en_mantencion" />
        {/* Equipos en manos de alguien desvinculado: sin esta tarjeta las de
            arriba no sumaban el total. */}
        <StatCard tilt label="No devuelto" value={data.noDevueltoAssets} tone={ESTADO_ACTIVO_TONO.no_devuelto} icon={UserX} href="/activos?estado=no_devuelto" />
        <StatCard tilt label="Baja" value={data.bajaAssets} tone={ESTADO_ACTIVO_TONO.baja} icon={XCircle} href="/activos?estado=baja" />
      </StatGrid>

      {/* Segunda fila. Un activo vendido sale del parque operativo y no cuenta
          en las tarjetas de arriba ni en "Stock por Categoria". */}
      <StatGrid cols={4}>
        <StatCard
          tilt
          label="Equipos Vendidos"
          value={data.vendidoAssets}
          tone={ESTADO_ACTIVO_TONO.vendido}
          icon={DollarSign}
          href="/activos?estado=vendido"
        />
        <StatCard tilt label="Mantenciones Pend." value={data.pendingMaintenance} tone="orange" icon={Clock} />
        <StatCard tilt label="Asig. Últimos 30d" value={data.recentAssignments} tone="primary" icon={TrendingUp} />
        <StatCard
          tilt
          label="Solicitudes Abiertas"
          value={data.solicitudesAbiertas}
          tone="primary"
          icon={ClipboardList}
          href="/solicitudes"
        />
      </StatGrid>

      {/* Gráficos */}
      <DashboardCharts
        stockByCategory={data.stockByCategory}
        estadosData={data.estadosData}
        asignacionesChartData={data.asignacionesChartData}
      />

      {/* Activos por Categoria y stock de Kit de Bienvenida/EPP. */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Activos por Categoría */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-fg mb-4">
              Activos por Categoría
            </h2>
            <div className="space-y-3">
              {data.categories.map((cat) => (
                <div key={cat.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CategoryIcon categoria={cat.nombre} className="h-5 w-5 text-fg-subtle" />
                    <span className="text-fg-muted">{cat.nombre}</span>
                  </div>
                  <span className="font-semibold text-fg">
                    {cat.total}
                  </span>
                </div>
              ))}
              {data.categories.length === 0 && (
                <p className="text-fg-subtle text-center py-4">
                  No hay activos registrados
                </p>
              )}
            </div>
          </div>

          {/* Kit de Bienvenida */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-fg mb-4">
              Kit de Bienvenida
            </h2>
            <div className="space-y-3">
              {data.kitBienvenidaItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-fg-muted">{item.nombre}</span>
                  <span
                    className={
                      item.cantidad === 0
                        ? "font-semibold text-red-600"
                        : item.cantidad <= item.stockMinimo
                        ? "font-semibold text-orange-600"
                        : "font-semibold text-fg"
                    }
                  >
                    {item.cantidad}
                  </span>
                </div>
              ))}
              {data.kitBienvenidaItems.length === 0 && (
                <p className="text-fg-subtle text-center py-4">
                  No hay artículos registrados
                </p>
              )}
            </div>
          </div>

          {/* EPP */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold text-fg mb-4">EPP</h2>
            <div className="space-y-3">
              {data.eppItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <span className="text-fg-muted">{item.nombre}</span>
                  <span
                    className={
                      item.cantidad === 0
                        ? "font-semibold text-red-600"
                        : item.cantidad <= item.stockMinimo
                        ? "font-semibold text-orange-600"
                        : "font-semibold text-fg"
                    }
                  >
                    {item.cantidad}
                  </span>
                </div>
              ))}
              {data.eppItems.length === 0 && (
                <p className="text-fg-subtle text-center py-4">
                  No hay artículos registrados
                </p>
              )}
            </div>
          </div>
      </div>
    </div>
  );
}
