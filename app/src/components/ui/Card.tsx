"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardVariant = "default" | "interactive" | "bordered";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: CardVariant;
  padding?: CardPadding;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

// La superficie base es la utilidad `card` (globals.css), la misma que usan
// los contenedores que no pasan por este componente.
//   interactive -> tarjetas clicables: la sombra crece al hover, como las
//                  tarjetas de servicios de sclconsultores.com.
const variantStyles: Record<CardVariant, string> = {
  default: "card",
  interactive: "card transition-shadow hover:shadow-card-hover motion-reduce:transition-none",
  bordered: "card border-2 border-gray-200 shadow-none",
};

const paddingStyles: Record<CardPadding, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export const Card = forwardRef<HTMLDivElement, CardProps>(
  (
    { variant = "default", padding = "md", title, subtitle, footer, children, className, ...props },
    ref
  ) => {
    const hasHeader = title || subtitle;
    const sectionPadding = padding !== "none" ? paddingStyles[padding] : "px-4 py-3";

    return (
      <div ref={ref} className={cn("overflow-hidden", variantStyles[variant], className)} {...props}>
        {hasHeader && (
          <div className={cn("border-b border-gray-100", sectionPadding)}>
            {title && (
              <h3 className="text-lg font-semibold text-gray-900 leading-tight">{title}</h3>
            )}
            {subtitle && <p className="mt-1 text-sm text-gray-500">{subtitle}</p>}
          </div>
        )}

        <div className={paddingStyles[padding]}>{children}</div>

        {footer && (
          <div className={cn("border-t border-gray-100 bg-gray-50/50", sectionPadding)}>
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = "Card";

export default Card;
