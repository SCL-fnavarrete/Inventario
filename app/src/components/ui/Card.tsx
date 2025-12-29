"use client";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

type CardVariant = "default" | "elevated" | "bordered";
type CardPadding = "none" | "sm" | "md" | "lg";

interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  variant?: CardVariant;
  padding?: CardPadding;
  title?: ReactNode;
  subtitle?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<CardVariant, string> = {
  default: `
    bg-white
    shadow-[0_1px_3px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.06)]
    border border-gray-100
  `,
  elevated: `
    bg-white
    shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1),0_2px_4px_-2px_rgba(0,0,0,0.1),0_0_0_1px_rgba(0,0,0,0.02)]
    hover:shadow-[0_10px_15px_-3px_rgba(0,0,0,0.1),0_4px_6px_-4px_rgba(0,0,0,0.1)]
    transition-shadow duration-200 ease-out
    motion-reduce:transition-none
  `,
  bordered: `
    bg-white
    border-2 border-gray-200
    shadow-none
  `,
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
      children,
      className = "",
      ...props
    },
    ref
  ) => {
    const hasHeader = title || subtitle;

    return (
      <div
        ref={ref}
        className={`
          rounded-xl
          overflow-hidden
          ${variantStyles[variant]}
          ${className}
        `}
        {...props}
      >
        {hasHeader && (
          <div
            className={`
              border-b border-gray-100
              ${padding !== "none" ? paddingStyles[padding] : "px-4 py-3"}
            `}
          >
            {title && (
              <h3 className="text-lg font-semibold text-gray-900 leading-tight">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
            )}
          </div>
        )}

        <div className={paddingStyles[padding]}>{children}</div>

        {footer && (
          <div
            className={`
              border-t border-gray-100
              bg-gray-50/50
              ${padding !== "none" ? paddingStyles[padding] : "px-4 py-3"}
            `}
          >
            {footer}
          </div>
        )}
      </div>
    );
  }
);

Card.displayName = "Card";

export default Card;
