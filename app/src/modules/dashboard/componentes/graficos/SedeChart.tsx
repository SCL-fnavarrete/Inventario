"use client";

import { ESTADO_ACTIVO_COLOR } from "@/modules/activos";
import { BarrasApiladas } from "@/modules/dashboard/componentes/graficos/BarrasApiladas";

interface SedeChartProps {
  data: { sede: string; disponibles: number; asignados: number; mantencion: number; otros: number }[];
}

/** Equipos por sede: donde esta el stock listo para asignar y donde falta. */
export function SedeChart({ data }: SedeChartProps) {
  return (
    <BarrasApiladas
      data={data}
      etiqueta="sede"
      series={[
        { clave: "disponibles", nombre: "Disponibles", color: ESTADO_ACTIVO_COLOR.disponible },
        { clave: "asignados", nombre: "Asignados", color: ESTADO_ACTIVO_COLOR.asignado },
        { clave: "mantencion", nombre: "Mantención", color: ESTADO_ACTIVO_COLOR.en_mantencion },
        { clave: "otros", nombre: "Otros (tránsito, no devuelto)", color: ESTADO_ACTIVO_COLOR.no_devuelto },
      ]}
    />
  );
}
