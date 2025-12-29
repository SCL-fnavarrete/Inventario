"use client";

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  PieLabelRenderProps,
} from "recharts";

interface EstadosChartProps {
  data: {
    estado: string;
    cantidad: number;
    color: string;
  }[];
}

const ESTADO_LABELS: Record<string, string> = {
  disponible: "Disponibles",
  asignado: "Asignados",
  en_mantencion: "En Mantención",
  reutilizable: "Reutilizables",
  baja: "Baja",
  vendido: "Vendidos",
};

export function EstadosChart({ data }: EstadosChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500">
        No hay datos para mostrar
      </div>
    );
  }

  const formattedData = data.map((item) => ({
    ...item,
    name: ESTADO_LABELS[item.estado] || item.estado,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={formattedData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={(props: PieLabelRenderProps) => {
            const percent = props.percent ?? 0;
            const name = props.name ?? "";
            return percent > 0.05 ? `${name} ${(percent * 100).toFixed(0)}%` : "";
          }}
          outerRadius={100}
          fill="#8884d8"
          dataKey="cantidad"
        >
          {formattedData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, name: string) => [value, name]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
