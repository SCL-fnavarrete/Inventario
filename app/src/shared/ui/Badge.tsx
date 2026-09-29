"use client";

import { forwardRef, type HTMLAttributes } from "react";
import type { CondicionActivo, EstadoActivo } from "@prisma/client";
import { cn } from "@/shared/cn";
import {
  CONDICION_ACTIVO_BADGE,
  CONDICION_ACTIVO_LABEL,
  ESTADO_ACTIVO_BADGE,
  ESTADO_ACTIVO_LABEL,
} from "@/modules/activos/estados";

type BadgeVariant = "primary" | "info" | "success" | "warning" | "error" | "neutral";
type BadgeSize = "sm" | "md";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
}

// Los colores por estado de activo no viven aqui sino en
// modules/activos/estados, que tambien consumen tablas y reportes.
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

export function getStatusLabel(status: EstadoActivo | string): string {
  return ESTADO_ACTIVO_LABEL[status as EstadoActivo] ?? status;
}

/** Estado del ciclo de vida de un activo, con el color del sistema. */
export const AssetStatusBadge = forwardRef<
  HTMLSpanElement,
  Omit<BadgeProps, "variant" | "children"> & { status: EstadoActivo | string }
>(({ status, className, ...props }, ref) => (
  <Badge ref={ref} dot className={cn(ESTADO_ACTIVO_BADGE[status as EstadoActivo], className)} {...props}>
    {getStatusLabel(status)}
  </Badge>
));

AssetStatusBadge.displayName = "AssetStatusBadge";

/**
 * Condicion fisica de un activo (nuevo / usado / danado). Acepta string
 * porque algunos selectores tipan la condicion como texto; un valor
 * desconocido cae al badge neutro con el valor tal cual.
 */
export function AssetConditionBadge({
  condicion,
  size = "sm",
}: {
  condicion: CondicionActivo | string;
  size?: BadgeSize;
}) {
  const clave = condicion as CondicionActivo;
  return (
    <Badge size={size} className={CONDICION_ACTIVO_BADGE[clave]}>
      {CONDICION_ACTIVO_LABEL[clave] ?? condicion}
    </Badge>
  );
}

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
