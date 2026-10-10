"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { COLOR_MARCA } from "@/shared/constantes/coloresGraficos";

interface AsignacionesChartProps {
  data: {
    mes: string;
    asignaciones: number;
    devoluciones: number;
  }[];
}

/** Entregas y devoluciones por mes, con el total del periodo arriba. */
export function AsignacionesChart({ data }: AsignacionesChartProps) {
  if (!data || data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">No hay datos para mostrar</div>;
  }
  const entregas = data.reduce((s, m) => s + m.asignaciones, 0);
  const devoluciones = data.reduce((s, m) => s + m.devoluciones, 0);
  const saldo = entregas - devoluciones;

  return (
    <div>
      {/* El saldo dice si el parque en uso crece (+) o baja (-) en el periodo. */}
      <dl className="mb-3 grid grid-cols-3 gap-2 text-center">
        <Resumen titulo="Entregas" valor={entregas} clase="text-primary-700" />
        <Resumen titulo="Devoluciones" valor={devoluciones} clase="text-orange-700" />
        <Resumen titulo="Saldo" valor={`${saldo > 0 ? "+" : ""}${saldo}`} clase={saldo >= 0 ? "text-emerald-700" : "text-red-700"} />
      </dl>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }} barGap={2}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis dataKey="mes" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="asignaciones" name="Entregas" fill={COLOR_MARCA.primario} radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="devoluciones" name="Devoluciones" fill={COLOR_MARCA.acento} radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function Resumen({ titulo, valor, clase }: { titulo: string; valor: number | string; clase: string }) {
  return (
    <div className="rounded-control bg-surface-muted px-2 py-1.5">
      <dt className="text-xs text-fg-subtle">{titulo}</dt>
      <dd className={`text-lg font-bold ${clase}`}>{valor}</dd>
    </div>
  );
}
