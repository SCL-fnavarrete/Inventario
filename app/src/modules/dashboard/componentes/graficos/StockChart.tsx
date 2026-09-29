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
import { ESTADO_ACTIVO_COLOR } from "@/modules/activos/estados";

interface StockChartProps {
  data: {
    categoria: string;
    disponibles: number;
    asignados: number;
    mantencion: number;
    // "Vendido" queda deliberadamente afuera de este grafico: un equipo
    // vendido ya no es stock.
  }[];
}

export function StockChart({ data }: StockChartProps) {
  // Stock operativo: una categoria sin equipos no aporta una barra, y un
  // equipo dado de baja no es stock (antes se sumaba).
  const conStock = (data ?? []).filter((c) => c.disponibles + c.asignados + c.mantencion > 0);

  if (conStock.length === 0) {
    return (
      <div className="flex items-center justify-center h-[300px] text-fg-subtle">
        No hay datos para mostrar
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={conStock} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" />
        {/* interval 0: todas las categorias con su nombre (antes se saltaba
            algunas y la barra quedaba sin nombre). */}
        <XAxis dataKey="categoria" tick={{ fontSize: 12 }} interval={0} />
        <YAxis />
        <Tooltip />
        <Legend />
        <Bar dataKey="disponibles" name="Disponibles" fill={ESTADO_ACTIVO_COLOR.disponible} stackId="a" />
        <Bar dataKey="asignados" name="Asignados" fill={ESTADO_ACTIVO_COLOR.asignado} stackId="a" />
        <Bar dataKey="mantencion" name="Mantención" fill={ESTADO_ACTIVO_COLOR.en_mantencion} stackId="a" />
      </BarChart>
    </ResponsiveContainer>
  );
}
