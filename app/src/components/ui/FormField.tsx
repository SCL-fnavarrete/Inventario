"use client";

import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

type FormFieldState = "default" | "error" | "success";

interface FormFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: string;
  helperText?: string;
  errorMessage?: string;
  successMessage?: string;
  state?: FormFieldState;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  size?: "sm" | "md" | "lg";
}

const sizeStyles = {
  sm: {
    input: "px-3 py-1.5 text-sm",
    label: "text-xs",
    helper: "text-xs",
    icon: "w-4 h-4",
    iconPadding: { left: "pl-9", right: "pr-9" },
  },
  md: {
    input: "px-3.5 py-2 text-sm",
    label: "text-sm",
    helper: "text-xs",
    icon: "w-4 h-4",
    iconPadding: { left: "pl-10", right: "pr-10" },
  },
  lg: {
    input: "px-4 py-2.5 text-base",
    label: "text-sm",
    helper: "text-sm",
    icon: "w-5 h-5",
    iconPadding: { left: "pl-11", right: "pr-11" },
  },
};

const stateStyles: Record<FormFieldState, { input: string; message: string }> = {
  default: {
    input: `
      border-gray-300
      focus:border-blue-500 focus:ring-blue-500/20
    `,
    message: "text-gray-500",
  },
  error: {
    input: `
      border-red-400
      focus:border-red-500 focus:ring-red-500/20
      bg-red-50/30
    `,
    message: "text-red-600",
  },
  success: {
    input: `
      border-green-400
      focus:border-green-500 focus:ring-green-500/20
      bg-green-50/30
    `,
    message: "text-green-600",
  },
};

export const FormField = forwardRef<HTMLInputElement, FormFieldProps>(
  (
    {
      label,
      helperText,
      errorMessage,
      successMessage,
      state = "default",
      leftIcon,
      rightIcon,
      size = "md",
      disabled,
      className = "",
      id: providedId,
      ...props
    },
    ref
  ) => {
    const generatedId = useId();
    const inputId = providedId || generatedId;
    const helperId = `${inputId}-helper`;
    const errorId = `${inputId}-error`;

    // Determine actual state based on messages
    const actualState = errorMessage ? "error" : successMessage ? "success" : state;
    const sizes = sizeStyles[size];
    const stateStyle = stateStyles[actualState];

    const message = errorMessage || successMessage || helperText;
    const messageId = errorMessage ? errorId : helperId;

    return (
      <div className={`space-y-1.5 ${className}`}>
        <label
          htmlFor={inputId}
          className={`
            block font-medium text-gray-700
            ${sizes.label}
            ${disabled ? "text-gray-400" : ""}
          `}
        >
          {label}
        </label>

        <div className="relative">
          {leftIcon && (
            <div
              className={`
                absolute left-3 top-1/2 -translate-y-1/2
                text-gray-400
                ${sizes.icon}
                pointer-events-none
              `}
            >
              {leftIcon}
            </div>
          )}

          <input
            ref={ref}
            id={inputId}
            disabled={disabled}
            aria-invalid={actualState === "error"}
            aria-describedby={message ? messageId : undefined}
            className={`
              w-full
              border rounded-lg
              bg-white
              transition-all duration-150 ease-out
              motion-reduce:transition-none
              focus:outline-none focus:ring-2
              placeholder:text-gray-400
              disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed
              ${sizes.input}
              ${leftIcon ? sizes.iconPadding.left : ""}
              ${rightIcon ? sizes.iconPadding.right : ""}
              ${stateStyle.input}
            `}
            {...props}
          />

          {rightIcon && (
            <div
              className={`
                absolute right-3 top-1/2 -translate-y-1/2
                text-gray-400
                ${sizes.icon}
              `}
            >
              {rightIcon}
            </div>
          )}
        </div>

        {message && (
          <p
            id={messageId}
            role={errorMessage ? "alert" : undefined}
            aria-live={errorMessage ? "polite" : undefined}
            className={`
              ${sizes.helper}
              ${stateStyle.message}
            `}
          >
            {message}
          </p>
        )}
      </div>
    );
  }
);

FormField.displayName = "FormField";

export default FormField;
