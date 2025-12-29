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
      <div className="flex items-center justify-center h-[300px] text-gray-500">
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
          stroke="#3b82f6"
          strokeWidth={2}
          dot={{ fill: "#3b82f6" }}
        />
        <Line
          type="monotone"
          dataKey="devoluciones"
          name="Devoluciones"
          stroke="#ef4444"
          strokeWidth={2}
          dot={{ fill: "#ef4444" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
