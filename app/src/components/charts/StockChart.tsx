"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { ESTADO_ACTIVO_COLOR } from "@/lib/constants/estadosActivo";

interface StockChartProps {
  data: {
    categoria: string;
    disponibles: number;
    asignados: number;
    mantencion: number;
    // "Vendido" queda deliberadamente afuera de este grafico: un equipo
    // vendido ya no es stock.
    baja: number;
  }[];
}

export function StockChart({ data }: StockChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-gray-500">
        No hay datos para mostrar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="categoria" tick={{ fontSize: 12 }} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="disponibles" name="Disponibles" fill={ESTADO_ACTIVO_COLOR.disponible} stackId="a" />
        <Bar dataKey="asignados" name="Asignados" fill={ESTADO_ACTIVO_COLOR.asignado} stackId="a" />
        <Bar dataKey="mantencion" name="Mantención" fill={ESTADO_ACTIVO_COLOR.en_mantencion} stackId="a" />
        <Bar dataKey="baja" name="Baja" fill={ESTADO_ACTIVO_COLOR.baja} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
