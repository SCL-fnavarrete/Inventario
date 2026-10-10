"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/**
 * Barras horizontales apiladas: una fila por grupo (categoria, sede...) y una
 * serie por estado. El nombre del grupo queda a la izquierda, legible, y el
 * alto crece con la cantidad de filas. Lo usan "Stock por categoria" y
 * "Equipos por sede".
 */
export interface SerieBarras {
  clave: string;
  nombre: string;
  color: string;
}

export function BarrasApiladas({
  data,
  etiqueta,
  series,
  vacio = "No hay datos para mostrar",
}: {
  data: Record<string, string | number>[];
  /** Campo con el nombre de cada fila. */
  etiqueta: string;
  series: SerieBarras[];
  vacio?: string;
}) {
  if (data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">{vacio}</div>;
  }
  const alto = Math.max(200, data.length * 34 + 64);
  return (
    <ResponsiveContainer width="100%" height={alto}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 0, bottom: 0 }} barCategoryGap="22%">
        <CartesianGrid horizontal={false} strokeDasharray="3 3" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
        <YAxis type="category" dataKey={etiqueta} width={120} tick={{ fontSize: 12 }} interval={0} />
        <Tooltip />
        <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
        {series.map((s, i) => (
          <Bar
            key={s.clave}
            dataKey={s.clave}
            name={s.nombre}
            stackId="a"
            fill={s.color}
            radius={i === series.length - 1 ? [0, 4, 4, 0] : 0}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
