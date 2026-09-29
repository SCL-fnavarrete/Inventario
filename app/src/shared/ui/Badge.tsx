"use client";

import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/shared/cn";

type BadgeVariant = "primary" | "info" | "success" | "warning" | "error" | "neutral";
export type BadgeSize = "sm" | "md";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
}

// Etiqueta generica. Las de estado y condicion de un equipo viven en
// Activos (modules/activos/componentes/BadgesActivo), con sus colores.
const variantStyles: Record<BadgeVariant, string> = {
  primary: "bg-primary-50 text-primary-800 border-primary-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-red-50 text-red-800 border-red-200",
  neutral: "bg-gray-100 text-fg-muted border-line",
};

const sizeStyles: Record<BadgeSize, { badge: string; dot: string }> = {
  sm: { badge: "px-2 py-0.5 text-xs", dot: "w-1.5 h-1.5" },
  md: { badge: "px-2.5 py-1 text-xs", dot: "w-2 h-2" },
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", size = "md", dot = false, children, className, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium select-none",
        sizeStyles[size].badge,
        variantStyles[variant],
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn("rounded-full flex-shrink-0 bg-current opacity-70", sizeStyles[size].dot)}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  )
);

Badge.displayName = "Badge";

/**
 * Activo/Inactivo de registros de catalogo (sedes, usuarios, tipos de
 * mantencion). Cada pantalla lo armaba a mano con su propio ternario de
 * clases; `labels` permite el femenino ("Activa") sin otra variante.
 * Con `onToggle` el badge es un boton que alterna el estado.
 */
export function ActiveBadge({
  activo,
  labels = ["Activo", "Inactivo"],
  size = "sm",
  onToggle,
}: {
  activo: boolean;
  labels?: [string, string];
  size?: BadgeSize;
  onToggle?: () => void;
}) {
  const badge = (
    <Badge variant={activo ? "success" : "neutral"} size={size}>
      {activo ? labels[0] : labels[1]}
    </Badge>
  );
  if (!onToggle) return badge;
  return (
    <button
      type="button"
      onClick={onToggle}
      title={activo ? "Clic para desactivar" : "Clic para activar"}
      className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
    >
      {badge}
    </button>
  );
}

export default Badge;
