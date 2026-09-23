import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

// Estilo de sclconsultores.com: colores planos, rounded-lg, semibold.
//   primary   -> accion principal de la pantalla (una por vista).
//   secondary -> accion de marca de menor peso: borde azul que se rellena al
//                hover, igual que el boton "Contacto" del sitio.
//   outline   -> neutro; para Cancelar/Volver, que no deben competir.
//   link      -> accion terciaria "Ver mas ->": texto con flecha que avanza.
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-700 text-white shadow-sm hover:bg-primary-800 active:bg-primary-900 disabled:bg-primary-300",
  secondary:
    "border-2 border-primary-700 bg-white text-primary-700 hover:bg-primary-700 hover:text-white disabled:border-primary-200 disabled:text-primary-300 disabled:hover:bg-white",
  outline:
    "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-400 active:bg-gray-100 disabled:bg-gray-50 disabled:text-gray-400 disabled:border-gray-200",
  ghost:
    "bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 active:bg-gray-200 disabled:text-gray-400 disabled:hover:bg-transparent",
  danger:
    "bg-red-600 text-white shadow-sm hover:bg-red-700 active:bg-red-800 disabled:bg-red-300",
  // px-0 va despues del tamano en cn(), asi que twMerge descarta el px-*.
  link: "group bg-transparent px-0 text-primary-700 hover:text-primary-900 disabled:text-gray-400",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-sm gap-1.5",
  md: "px-4 py-2 text-sm gap-2",
  lg: "px-6 py-3 text-base gap-2.5",
};

export const iconSizes: Record<ButtonSize, string> = {
  sm: "w-3.5 h-3.5",
  md: "w-4 h-4",
  lg: "w-5 h-5",
};

/**
 * Clases de un boton, sin el elemento. Existe para que un <Link> o un
 * <button> nativo (ej. submit de un form) se vean identicos a <Button> sin
 * duplicar el estilo. Vive fuera de Button.tsx porque ese archivo es
 * "use client" y las paginas de servidor tambien la necesitan.
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex items-center justify-center rounded-control font-semibold select-none",
    "transition-colors motion-reduce:transition-none",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed",
    sizeStyles[size],
    variantStyles[variant],
    className
  );
}
