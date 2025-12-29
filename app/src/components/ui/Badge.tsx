"use client";

import { forwardRef, type HTMLAttributes } from "react";

// Estados específicos del sistema de inventario
type AssetStatus =
  | "disponible"
  | "asignado"
  | "en_mantencion"
  | "reutilizable"
  | "baja"
  | "vendido";

// Variantes genéricas
type BadgeVariant =
  | AssetStatus
  | "info"
  | "success"
  | "warning"
  | "error"
  | "neutral";

type BadgeSize = "sm" | "md";
type BadgeStyle = "solid" | "outline";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  styleType?: BadgeStyle;
  dot?: boolean;
  children: React.ReactNode;
}

const variantColors: Record<
  BadgeVariant,
  { solid: string; outline: string; dot: string }
> = {
  // Estados de activos
  disponible: {
    solid: "bg-emerald-100 text-emerald-800 border-emerald-200",
    outline: "bg-transparent text-emerald-700 border-emerald-400",
    dot: "bg-emerald-500",
  },
  asignado: {
    solid: "bg-blue-100 text-blue-800 border-blue-200",
    outline: "bg-transparent text-blue-700 border-blue-400",
    dot: "bg-blue-500",
  },
  en_mantencion: {
    solid: "bg-amber-100 text-amber-800 border-amber-200",
    outline: "bg-transparent text-amber-700 border-amber-400",
    dot: "bg-amber-500",
  },
  reutilizable: {
    solid: "bg-purple-100 text-purple-800 border-purple-200",
    outline: "bg-transparent text-purple-700 border-purple-400",
    dot: "bg-purple-500",
  },
  baja: {
    solid: "bg-red-100 text-red-800 border-red-200",
    outline: "bg-transparent text-red-700 border-red-400",
    dot: "bg-red-500",
  },
  vendido: {
    solid: "bg-gray-100 text-gray-700 border-gray-200",
    outline: "bg-transparent text-gray-600 border-gray-400",
    dot: "bg-gray-500",
  },
  // Variantes genéricas
  info: {
    solid: "bg-sky-100 text-sky-800 border-sky-200",
    outline: "bg-transparent text-sky-700 border-sky-400",
    dot: "bg-sky-500",
  },
  success: {
    solid: "bg-emerald-100 text-emerald-800 border-emerald-200",
    outline: "bg-transparent text-emerald-700 border-emerald-400",
    dot: "bg-emerald-500",
  },
  warning: {
    solid: "bg-amber-100 text-amber-800 border-amber-200",
    outline: "bg-transparent text-amber-700 border-amber-400",
    dot: "bg-amber-500",
  },
  error: {
    solid: "bg-red-100 text-red-800 border-red-200",
    outline: "bg-transparent text-red-700 border-red-400",
    dot: "bg-red-500",
  },
  neutral: {
    solid: "bg-gray-100 text-gray-700 border-gray-200",
    outline: "bg-transparent text-gray-600 border-gray-400",
    dot: "bg-gray-500",
  },
};

const sizeStyles: Record<BadgeSize, { badge: string; dot: string }> = {
  sm: {
    badge: "px-2 py-0.5 text-xs",
    dot: "w-1.5 h-1.5",
  },
  md: {
    badge: "px-2.5 py-1 text-xs",
    dot: "w-2 h-2",
  },
};

// Mapeo de estados para display
const statusLabels: Record<AssetStatus, string> = {
  disponible: "Disponible",
  asignado: "Asignado",
  en_mantencion: "En Mantención",
  reutilizable: "Reutilizable",
  baja: "Baja",
  vendido: "Vendido",
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "neutral",
      size = "md",
      styleType = "solid",
      dot = false,
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const colors = variantColors[variant];
    const sizes = sizeStyles[size];

    return (
      <span
        ref={ref}
        className={`
          inline-flex items-center gap-1.5
          font-medium
          rounded-full
          border
          select-none
          ${sizes.badge}
          ${colors[styleType]}
          ${className}
        `}
        {...props}
      >
        {dot && (
          <span
            className={`
              rounded-full
              flex-shrink-0
              ${sizes.dot}
              ${colors.dot}
            `}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    );
  }
);

Badge.displayName = "Badge";

// Helper para convertir estado a label
export function getStatusLabel(status: AssetStatus): string {
  return statusLabels[status] || status;
}

// Componente especializado para estados de activos
export const AssetStatusBadge = forwardRef<
  HTMLSpanElement,
  Omit<BadgeProps, "variant" | "children"> & { status: AssetStatus }
>(({ status, ...props }, ref) => (
  <Badge ref={ref} variant={status} dot {...props}>
    {getStatusLabel(status)}
  </Badge>
));

AssetStatusBadge.displayName = "AssetStatusBadge";

export default Badge;
