import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/shared/cn";
import { TONO_ACENTO, TONO_ESTILO, type Tono } from "@/shared/constantes/tonos";
import { Tilt } from "@/shared/ui/Tilt";

export type StatTone = Tono;

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
  icon?: ComponentType<{ className?: string }>;
  /**
   * card  -> tarjeta destacada (card-feature) teñida con el tono, etiqueta
   *          arriba y el icono en un circulo a la derecha (Dashboard,
   *          Mantenciones, Compras).
   * soft  -> bloque teñido y centrado, para resúmenes dentro de otra
   *          tarjeta (revision de import, reportes).
   */
  variant?: "card" | "soft";
  hint?: ReactNode;
  /** Convierte la tarjeta en link (ej. "Equipos Vendidos" -> listado filtrado). */
  href?: string;
  /**
   * Convierte la tarjeta en boton de filtro (ej. Mantenciones, SPEC 2.107):
   * al pulsarla filtra la lista de la misma pantalla.
   */
  onClick?: () => void;
  /** Filtro de esta tarjeta aplicado: queda marcada. */
  activa?: boolean;
  /** Inclinacion 3D al hover. Solo para filas cortas de KPIs, no listas. */
  tilt?: boolean;
  className?: string;
}

/**
 * Indicador numerico. Reemplaza las ~40 tarjetas "numero grande + etiqueta"
 * que cada pagina armaba con sus propias clases.
 */
export function StatCard({
  label,
  value,
  tone = "neutral",
  icon: Icon,
  variant = "card",
  hint,
  href,
  onClick,
  activa = false,
  tilt = false,
  className,
}: StatCardProps) {
  const t = TONO_ESTILO[tone];

  if (variant === "soft") {
    return (
      <div className={cn("rounded-control p-4 text-center", t.suave, className)}>
        {Icon && <Icon className={cn("mx-auto mb-2 h-7 w-7", t.valor)} />}
        <p className={cn("text-2xl font-bold", t.valor)}>{value}</p>
        <p className="mt-0.5 text-sm text-fg-muted">{label}</p>
        {hint && <p className="mt-1 text-xs text-fg-subtle">{hint}</p>}
      </div>
    );
  }

  const contenido = (
    <>
      <div className="min-w-0">
        <p className="text-sm text-fg-subtle">{label}</p>
        <p className={cn("text-2xl font-bold", t.valor)}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-fg-subtle">{hint}</p>}
      </div>
      {Icon && (
        <div className={cn("flex-shrink-0 rounded-full p-3", t.icono)}>
          <Icon className="h-5 w-5" />
        </div>
      )}
    </>
  );
  const base = cn(
    "card-feature flex h-full items-center justify-between gap-3 p-4",
    TONO_ACENTO[tone],
    activa && "ring-2 ring-primary-500 ring-offset-2 ring-offset-surface"
  );

  const tarjeta = href ? (
    <Link href={href} className={cn(base, !tilt && className)}>
      {contenido}
    </Link>
  ) : onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activa}
      className={cn(base, "w-full cursor-pointer text-left", !tilt && className)}
    >
      {contenido}
    </button>
  ) : (
    <div className={cn(base, !tilt && className)}>{contenido}</div>
  );

  return tilt ? <Tilt className={className}>{tarjeta}</Tilt> : tarjeta;
}

// 5 columnas desde lg (1024px); 6 recien en xl, donde cada tarjeta aun
// tiene ancho para numero + icono.
const gridCols = {
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 lg:grid-cols-5",
  6: "grid-cols-2 md:grid-cols-3 xl:grid-cols-6",
} as const;

/** Grilla responsive para una fila de StatCard. */
export function StatGrid({
  cols = 4,
  children,
  className,
}: {
  cols?: keyof typeof gridCols;
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("grid gap-4", gridCols[cols], className)}>{children}</div>;
}

export default StatCard;
