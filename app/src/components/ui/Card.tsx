"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONO_ACENTO, type Tono } from "@/lib/constants/tonos";
import { Tilt } from "@/components/ui/Tilt";

type CardVariant = "default" | "interactive" | "bordered" | "feature";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: CardVariant;
  padding?: CardPadding;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  /** Solo variant="feature": color de acento, derivado de un dato real. */
  accent?: Tono;
  /** Inclinacion 3D al hover. Solo para pocas tarjetas a la vez. */
  tilt?: boolean;
  children: ReactNode;
}

// La superficie base es la utilidad `card` (globals.css), la misma que usan
// los contenedores que no pasan por este componente.
//   interactive -> tarjetas clicables: la sombra crece al hover, como las
//                  tarjetas de servicios de sclconsultores.com.
//   feature     -> tarjeta destacada con halo del color de acento
//                  (card-feature en globals.css).
const variantStyles: Record<CardVariant, string> = {
  default: "card",
  interactive: "card transition-shadow hover:shadow-card-hover motion-reduce:transition-none",
  bordered: "card border-2 border-line shadow-none",
  feature: "card-feature",
};

const paddingStyles: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    {
      variant = "default",
      padding = "md",
      title,
      subtitle,
      footer,
      accent = "primary",
      tilt = false,
      children,
      className,
      ...props
    },
    ref
  ) => {
    const hasHeader = title || subtitle;
    const sectionPadding = padding !== "none" ? paddingStyles[padding] : "px-4 py-3";

    const tarjeta = (
      <div
        ref={ref}
        className={cn(
          "overflow-hidden",
          variantStyles[variant],
          variant === "feature" && TONO_ACENTO[accent],
          tilt && "h-full",
          className
        )}
        {...props}
      >
        {hasHeader && (
          <div className={cn("border-b border-line", sectionPadding)}>
            {title && (
              <h3 className="text-lg font-semibold text-fg leading-tight">{title}</h3>
            )}
            {subtitle && <p className="mt-1 text-sm text-fg-subtle">{subtitle}</p>}
          </div>
        )}

        <div className={paddingStyles[padding]}>{children}</div>

        {footer && (
          <div className={cn("border-t border-line bg-surface-muted/50", sectionPadding)}>
            {footer}
          </div>
        )}
      </div>
    );

    return tilt ? <Tilt>{tarjeta}</Tilt> : tarjeta;
  }
);

Card.displayName = "Card";

export default Card;
