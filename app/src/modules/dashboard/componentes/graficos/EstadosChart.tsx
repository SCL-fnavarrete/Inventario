"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
  en_mantencion: "En mantención",
  no_devuelto: "No devueltos",
  en_transito: "En tránsito",
  por_repartir: "Por repartir",
  baja: "Baja",
};

/** Dona de estados con el total al centro y, al lado, cada estado con su cantidad y porcentaje. */
export function EstadosChart({ data }: EstadosChartProps) {
  if (!data || data.length === 0) {
    return <div className="flex h-48 items-center justify-center text-sm text-fg-subtle">No hay datos para mostrar</div>;
  }

  const filas = data.map((d) => ({ ...d, name: ESTADO_LABELS[d.estado] || d.estado }));
  const total = filas.reduce((s, f) => s + f.cantidad, 0);

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row">
      <div className="relative h-48 w-48 shrink-0" role="img" aria-label={`${total} equipos por estado`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={filas} dataKey="cantidad" nameKey="name" innerRadius="66%" outerRadius="100%" paddingAngle={2} stroke="none">
              {filas.map((f) => (
                <Cell key={f.estado} fill={f.color} />
              ))}
            </Pie>
            {/* Recharts pinta el texto de la torta en negro fijo: se usa el del tema para el modo oscuro. */}
            <Tooltip itemStyle={{ color: "var(--fg)" }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold text-fg">{total.toLocaleString("es-CL")}</span>
          <span className="text-xs text-fg-subtle">equipos</span>
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-1.5 text-sm">
        {filas.map((f) => (
          <li key={f.estado} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: f.color }} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-fg-muted">{f.name}</span>
            <span className="font-semibold text-fg">{f.cantidad.toLocaleString("es-CL")}</span>
            <span className="w-10 text-right text-xs text-fg-subtle">{Math.round((f.cantidad / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
