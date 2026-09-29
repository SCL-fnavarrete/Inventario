"use client";

import { StockChart, EstadosChart, AsignacionesChart } from "@/modules/dashboard/componentes/graficos";

interface DashboardChartsProps {
  stockByCategory: {
    categoria: string;
    disponibles: number;
    asignados: number;
    mantencion: number;
  }[];
  estadosData: {
    estado: string;
    cantidad: number;
    color: string;
  }[];
  asignacionesChartData: {
    mes: string;
    asignaciones: number;
    devoluciones: number;
  }[];
}

export function DashboardCharts({
  stockByCategory,
  estadosData,
  asignacionesChartData,
}: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
      {/* Gráfico de Stock por Categoría (Barras apiladas) */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-fg mb-4">
          Stock por Categoría
        </h2>
        <StockChart data={stockByCategory} />
      </div>

      {/* Gráfico de Estados (Pie Chart) */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-fg mb-4">
          Distribución por Estado
        </h2>
        <EstadosChart data={estadosData} />
      </div>

      {/* Gráfico de Asignaciones por Mes (Líneas) */}
      <div className="card p-6 lg:col-span-2 xl:col-span-1">
        <h2 className="text-lg font-semibold text-fg mb-4">
          Movimientos (Últimos 6 meses)
        </h2>
        <AsignacionesChart data={asignacionesChartData} />
      </div>
    </div>
  );
}
