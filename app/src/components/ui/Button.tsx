"use client";

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

type ButtonVariant = "primary" | "secondary" | "danger" | "outline" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  children: ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: `
    bg-gradient-to-b from-blue-500 to-blue-600
    text-white font-medium
    shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]
    hover:from-blue-600 hover:to-blue-700
    active:from-blue-700 active:to-blue-800
    focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
    disabled:from-blue-300 disabled:to-blue-400 disabled:cursor-not-allowed
  `,
  secondary: `
    bg-gradient-to-b from-gray-100 to-gray-200
    text-gray-700 font-medium
    shadow-[0_1px_2px_rgba(0,0,0,0.05),inset_0_1px_0_rgba(255,255,255,0.8)]
    border border-gray-300
    hover:from-gray-200 hover:to-gray-300
    active:from-gray-300 active:to-gray-400
    focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2
    disabled:from-gray-100 disabled:to-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
  `,
  danger: `
    bg-gradient-to-b from-red-500 to-red-600
    text-white font-medium
    shadow-[0_1px_2px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.1)]
    hover:from-red-600 hover:to-red-700
    active:from-red-700 active:to-red-800
    focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2
    disabled:from-red-300 disabled:to-red-400 disabled:cursor-not-allowed
  `,
  outline: `
    bg-white
    text-gray-700 font-medium
    border-2 border-gray-300
    hover:bg-gray-50 hover:border-gray-400
    active:bg-gray-100
    focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
    disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200 disabled:cursor-not-allowed
  `,
  ghost: `
    bg-transparent
    text-gray-600 font-medium
    hover:bg-gray-100 hover:text-gray-900
    active:bg-gray-200
    focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2
    disabled:text-gray-400 disabled:hover:bg-transparent disabled:cursor-not-allowed
  `,
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5 rounded-md",
  md: "px-4 py-2 text-sm gap-2 rounded-lg",
  lg: "px-6 py-3 text-base gap-2.5 rounded-lg",
};

const iconSizes: Record<ButtonSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

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
      className = "",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`
          inline-flex items-center justify-center
          transition-all duration-150 ease-out
          motion-reduce:transition-none
          select-none
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${className}
        `}
        {...props}
      >
        {loading ? (
          <Loader2 className={`${iconSizes[size]} animate-spin motion-reduce:animate-none`} />
        ) : leftIcon ? (
          <span className={iconSizes[size]}>{leftIcon}</span>
        ) : null}

        <span className={loading ? "opacity-70" : ""}>{children}</span>

        {!loading && rightIcon && (
          <span className={iconSizes[size]}>{rightIcon}</span>
        )}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
