"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { COLOR_MARCA } from "@/lib/constants/coloresGraficos";

interface AsignacionesChartProps {
  data: {
    mes: string;
    asignaciones: number;
    devoluciones: number;
  }[];
}

export function AsignacionesChart({ data }: AsignacionesChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-fg-subtle">
        No hay datos para mostrar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Line
          type="monotone"
          dataKey="asignaciones"
          name="Asignaciones"
          stroke={COLOR_MARCA.primario}
          strokeWidth={2}
          dot={{ fill: COLOR_MARCA.primario }}
        />
        <Line
          type="monotone"
          dataKey="devoluciones"
          name="Devoluciones"
          stroke={COLOR_MARCA.acento}
          strokeWidth={2}
          dot={{ fill: COLOR_MARCA.acento }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
