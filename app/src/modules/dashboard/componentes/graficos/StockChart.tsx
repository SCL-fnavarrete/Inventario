"use client";

import { ESTADO_ACTIVO_COLOR } from "@/modules/activos";
import { BarrasApiladas } from "@/modules/dashboard/componentes/graficos/BarrasApiladas";

interface StockChartProps {
  data: {
    categoria: string;
    disponibles: number;
    asignados: number;
    mantencion: number;
  }[];
}

/** Stock por categoria: cuantos equipos hay disponibles, asignados y en mantencion. */
export function StockChart({ data }: StockChartProps) {
  // Stock operativo: una categoria sin equipos no aporta una barra, y un
  // equipo dado de baja no es stock. Las mas grandes, arriba.
  const filas = (data ?? [])
    .filter((c) => c.disponibles + c.asignados + c.mantencion > 0)
    .sort((a, b) => b.disponibles + b.asignados + b.mantencion - (a.disponibles + a.asignados + a.mantencion));

  return (
    <BarrasApiladas
      data={filas}
      etiqueta="categoria"
      series={[
        { clave: "disponibles", nombre: "Disponibles", color: ESTADO_ACTIVO_COLOR.disponible },
        { clave: "asignados", nombre: "Asignados", color: ESTADO_ACTIVO_COLOR.asignado },
        { clave: "mantencion", nombre: "Mantención", color: ESTADO_ACTIVO_COLOR.en_mantencion },
      ]}
    />
  );
}
