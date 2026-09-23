import Link from "next/link";
import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone = "neutral" | "primary" | "success" | "warning" | "orange" | "danger";

// Tono -> [valor, fondo suave, icono]. Un solo mapa para que "danger" sea
// el mismo rojo en el Dashboard, Mantenciones y el panel de importacion.
const toneStyles: Record<StatTone, { value: string; soft: string; icon: string }> = {
  neutral: { value: "text-gray-900", soft: "bg-gray-50", icon: "bg-gray-100 text-gray-600" },
  primary: { value: "text-primary-700", soft: "bg-primary-50", icon: "bg-primary-100 text-primary-700" },
  success: { value: "text-emerald-700", soft: "bg-emerald-50", icon: "bg-emerald-100 text-emerald-700" },
  warning: { value: "text-amber-700", soft: "bg-amber-50", icon: "bg-amber-100 text-amber-700" },
  orange: { value: "text-orange-700", soft: "bg-orange-50", icon: "bg-orange-100 text-orange-700" },
  danger: { value: "text-red-700", soft: "bg-red-50", icon: "bg-red-100 text-red-700" },
};

interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  tone?: StatTone;
  icon?: ComponentType<{ className?: string }>;
  /**
   * card  -> tarjeta blanca, etiqueta arriba y el icono en un circulo a la
   *          derecha (Dashboard, Mantenciones, Compras).
   * soft  -> bloque teñido y centrado, para resúmenes dentro de otra
   *          tarjeta (revision de import, reportes).
   */
  variant?: "card" | "soft";
  hint?: ReactNode;
  /** Convierte la tarjeta en link (ej. "Equipos Vendidos" -> listado filtrado). */
  href?: string;
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
  className,
}: StatCardProps) {
  const t = toneStyles[tone];

  if (variant === "soft") {
    return (
      <div className={cn("rounded-control p-4 text-center", t.soft, className)}>
        {Icon && <Icon className={cn("mx-auto mb-2 h-7 w-7", t.value)} />}
        <p className={cn("text-2xl font-bold", t.value)}>{value}</p>
        <p className="mt-0.5 text-sm text-gray-600">{label}</p>
        {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }

  const contenido = (
    <>
      <div className="min-w-0">
        <p className="text-sm text-gray-500">{label}</p>
        <p className={cn("text-2xl font-bold", t.value)}>{value}</p>
        {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      </div>
      {Icon && (
        <div className={cn("flex-shrink-0 rounded-full p-3", t.icon)}>
          <Icon className="h-5 w-5" />
        </div>
      )}
    </>
  );
  const base = "card flex items-center justify-between gap-3 p-4";

  if (href) {
    return (
      <Link
        href={href}
        className={cn(base, "transition-shadow hover:shadow-card-hover motion-reduce:transition-none", className)}
      >
        {contenido}
      </Link>
    );
  }

  return <div className={cn(base, className)}>{contenido}</div>;
}

// Las filas de 5-6 saltan recien en xl (1280px): en lg el Sidebar ya ocupa
// ancho fijo y las tarjetas quedarian demasiado angostas.
const gridCols = {
  2: "grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  4: "grid-cols-2 md:grid-cols-4",
  5: "grid-cols-2 md:grid-cols-3 xl:grid-cols-5",
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
