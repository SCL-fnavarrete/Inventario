"use client";

import type { ReactNode } from "react";
import { AsignacionesChart, EstadosChart, SedeChart, StockChart } from "@/modules/dashboard/componentes/graficos";

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
  equiposPorSede: {
    sede: string;
    disponibles: number;
    asignados: number;
    mantencion: number;
    otros: number;
  }[];
}

/** Una tarjeta de grafico: titulo y una linea que dice que se esta mirando. */
function TarjetaGrafico({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: ReactNode }) {
  return (
    <section className="card p-5" aria-label={titulo}>
      <h2 className="text-base font-semibold text-fg">{titulo}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{ayuda}</p>
      {children}
    </section>
  );
}

export function DashboardCharts({ stockByCategory, estadosData, asignacionesChartData, equiposPorSede }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <TarjetaGrafico titulo="Estado del parque" ayuda="Todos los equipos por estado, con su porcentaje.">
        <EstadosChart data={estadosData} />
      </TarjetaGrafico>

      <TarjetaGrafico titulo="Equipos por sede" ayuda="Dónde está el stock listo para asignar (verde) y dónde falta.">
        <SedeChart data={equiposPorSede} />
      </TarjetaGrafico>

      <TarjetaGrafico titulo="Stock por categoría" ayuda="Disponibles, asignados y en mantención de cada categoría; las más grandes arriba.">
        <StockChart data={stockByCategory} />
      </TarjetaGrafico>

      <TarjetaGrafico titulo="Movimientos" ayuda="Entregas y devoluciones de los últimos 6 meses.">
        <AsignacionesChart data={asignacionesChartData} />
      </TarjetaGrafico>
    </div>
  );
}
