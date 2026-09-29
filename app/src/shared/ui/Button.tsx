"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2, ArrowRight } from "lucide-react";
import { cn } from "@/shared/cn";
import { buttonClasses, iconSizes, type ButtonSize, type ButtonVariant } from "@/shared/ui/buttonStyles";

export { buttonClasses, type ButtonSize, type ButtonVariant };

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

/** Flecha de la variante link; se desplaza al hover como en el sitio. */
export function LinkArrow({ size = "md" }: { size?: ButtonSize }) {
  return (
    <ArrowRight
      className={cn(
        iconSizes[size],
        "transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
      )}
      aria-hidden="true"
    />
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      children,
      disabled,
      className,
      type = "button",
      ...props
    },
    ref
  ) => {
    const trailing = rightIcon ? (
      <span className={iconSizes[size]}>{rightIcon}</span>
    ) : variant === "link" ? (
      <LinkArrow size={size} />
    ) : null;

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || loading}
        className={buttonClasses({ variant, size, className })}
        {...props}
      >
        {loading ? (
          <Loader2 className={cn(iconSizes[size], "animate-spin motion-reduce:animate-none")} />
        ) : leftIcon ? (
          <span className={iconSizes[size]}>{leftIcon}</span>
        ) : null}

        <span className={loading ? "opacity-70" : undefined}>{children}</span>

        {!loading && trailing}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
