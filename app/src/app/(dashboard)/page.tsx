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
  Truck,
  UserX,
} from "lucide-react";
import { DashboardCharts, AlertsPanel, PanelOperacion, ListaConBarras, type FilaBarra } from "@/modules/dashboard/componentes";
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

  const mayorCategoria = Math.max(1, ...data.categories.map((c) => c.total));
  const categoriasConBarra: FilaBarra[] = [...data.categories]
    .sort((a, b) => b.total - a.total)
    .map((cat) => ({
      id: cat.id,
      nombre: cat.nombre,
      cantidad: cat.total,
      porcentaje: (cat.total / mayorCategoria) * 100,
      icono: <CategoryIcon categoria={cat.nombre} className="h-4 w-4 shrink-0 text-fg-subtle" />,
    }));

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
        equiposSinSede={data.equiposSinSede}
      />

      {/* KPIs principales en dos filas de 5. "Total Activos" cuenta todos los estados. */}
      <StatGrid cols={5}>
        <StatCard tilt label="Total Activos" value={data.totalAssets} tone="primary" icon={Package} href="/activos" />
        <StatCard tilt label="Disponibles" value={data.availableAssets} tone={ESTADO_ACTIVO_TONO.disponible} icon={CheckCircle} href="/activos?estado=disponible" />
        <StatCard tilt label="Asignados" value={data.assignedAssets} tone={ESTADO_ACTIVO_TONO.asignado} icon={Users} href="/activos?estado=asignado" />
        <StatCard tilt label="En Mantención" value={data.maintenanceAssets} tone={ESTADO_ACTIVO_TONO.en_mantencion} icon={Wrench} href="/activos?estado=en_mantencion" />
        {/* Equipos en manos de alguien desvinculado: sin esta tarjeta las de
            arriba no sumaban el total. */}
        <StatCard tilt label="No devuelto" value={data.noDevueltoAssets} tone={ESTADO_ACTIVO_TONO.no_devuelto} icon={UserX} href="/activos?estado=no_devuelto" />
        <StatCard tilt label="Baja" value={data.bajaAssets} tone={ESTADO_ACTIVO_TONO.baja} icon={XCircle} href="/activos?estado=baja" />
        <StatCard tilt label="Mantenciones Pend." value={data.pendingMaintenance} tone="orange" icon={Clock} />
        <StatCard tilt label="Asig. Últimos 30d" value={data.recentAssignments} tone="primary" icon={TrendingUp} />
        <StatCard tilt label="En tránsito" value={data.enCaminoAssets} tone={ESTADO_ACTIVO_TONO.en_transito} icon={Truck} href="/despachos" />
      </StatGrid>

      {/* Operacion: lo que el tecnico tiene que hacer y lo ultimo que paso */}
      <PanelOperacion
        noDevueltos={data.noDevueltoAssets}
        pendientes={data.pendientesDeDevolucion}
        actividad={data.actividadReciente}
        lineas={data.lineas}
      />

      {/* Graficos */}
      <DashboardCharts
        stockByCategory={data.stockByCategory}
        estadosData={data.estadosData}
        asignacionesChartData={data.asignacionesChartData}
        equiposPorSede={data.equiposPorSede}
      />

      {/* Activos por categoria y stock de Kit de Bienvenida/EPP. */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <ListaConBarras
          titulo="Activos por categoría"
          ayuda="Todos los equipos de cada categoría, sea cual sea su estado."
          vacio="No hay activos registrados"
          filas={categoriasConBarra}
        />
        <ListaConBarras
          titulo="Kit de Bienvenida"
          ayuda="Stock de cada artículo contra su mínimo."
          vacio="No hay artículos registrados"
          filas={filasDeStock(data.kitBienvenidaItems)}
        />
        <ListaConBarras titulo="EPP" ayuda="Stock de cada artículo contra su mínimo." vacio="No hay artículos registrados" filas={filasDeStock(data.eppItems)} />
      </div>
    </div>
  );
}

/** Stock de Kit/EPP: la barra es la cantidad contra el doble del minimo; rojo sin stock, naranjo en el minimo o bajo. */
function filasDeStock(items: { id: string; nombre: string; cantidad: number; stockMinimo: number }[]): FilaBarra[] {
  return items.map((item) => ({
    id: item.id,
    nombre: item.nombre,
    cantidad: item.cantidad,
    porcentaje: item.stockMinimo > 0 ? Math.min(100, (item.cantidad / (item.stockMinimo * 2)) * 100) : item.cantidad > 0 ? 100 : 0,
    detalle: item.stockMinimo > 0 ? `mínimo ${item.stockMinimo}` : undefined,
    nivel: item.cantidad === 0 ? "sin" : item.cantidad <= item.stockMinimo ? "bajo" : "ok",
  }));
}
