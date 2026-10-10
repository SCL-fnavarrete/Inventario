import type { ReactNode } from "react";
import { cn } from "@/shared/cn";

/**
 * Lista de "nombre ... numero" con una barra debajo, para ver de un vistazo
 * quien tiene mas o menos. Sirve para las categorias (barra = parte del total) y
 * para el stock de Kit/EPP (barra = cantidad contra el minimo; rojo si no hay,
 * naranjo si esta en el minimo o bajo).
 */
export interface FilaBarra {
  id: string;
  nombre: string;
  cantidad: number;
  /** Lo que llena la barra, de 0 a 100. */
  porcentaje: number;
  /** Texto chico bajo el nombre (ej. "minimo 5"). */
  detalle?: string;
  nivel?: "ok" | "bajo" | "sin";
  icono?: ReactNode;
}

const COLOR_BARRA = { ok: "bg-primary-500", bajo: "bg-orange-500", sin: "bg-red-500" } as const;
const COLOR_NUMERO = { ok: "text-fg", bajo: "text-orange-600", sin: "text-red-600" } as const;

export function ListaConBarras({ titulo, ayuda, filas, vacio }: { titulo: string; ayuda: string; filas: FilaBarra[]; vacio: string }) {
  return (
    <section className="card p-5" aria-label={titulo}>
      <h2 className="text-base font-semibold text-fg">{titulo}</h2>
      <p className="mb-4 text-xs text-fg-subtle">{ayuda}</p>
      {filas.length === 0 ? (
        <p className="py-6 text-center text-sm text-fg-subtle">{vacio}</p>
      ) : (
        <ul className="space-y-3">
          {filas.map((f) => {
            const nivel = f.nivel ?? "ok";
            return (
              <li key={f.id}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="flex min-w-0 items-center gap-2.5 text-fg-muted">
                    {f.icono}
                    <span className="truncate">{f.nombre}</span>
                  </span>
                  <span className={cn("font-semibold", COLOR_NUMERO[nivel])}>{f.cantidad.toLocaleString("es-CL")}</span>
                </div>
                <div
                  className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted"
                  role="progressbar"
                  aria-valuenow={Math.round(f.porcentaje)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={f.nombre}
                >
                  <div className={cn("h-full rounded-full", COLOR_BARRA[nivel])} style={{ width: `${Math.max(f.porcentaje, f.cantidad > 0 ? 3 : 0)}%` }} />
                </div>
                {f.detalle && <p className="mt-0.5 text-[11px] text-fg-subtle">{f.detalle}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
