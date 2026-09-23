import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
export type ButtonSize = "sm" | "md" | "lg";

// Estilo de sclconsultores.com: colores planos, rounded-lg, semibold.
//   primary   -> accion principal de la pantalla (una por vista).
//   secondary -> accion de marca de menor peso: borde azul que se rellena al
//                hover, igual que el boton "Contacto" del sitio.
//   outline   -> neutro; para Cancelar/Volver, que no deben competir.
//   link      -> accion terciaria "Ver mas ->": texto con flecha que avanza.
// Los rellenos solidos usan tokens fijos (brand, danger): la escala
// primary-*/red-* se invierte en modo oscuro y el blanco perderia contraste.
const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-white shadow-sm hover:bg-brand-hover active:bg-navy disabled:opacity-50 disabled:hover:bg-brand",
  secondary:
    "border-2 border-brand bg-surface text-primary-700 hover:bg-brand hover:text-white disabled:opacity-50 disabled:hover:bg-surface disabled:hover:text-primary-700",
  outline:
    "border border-line-strong bg-surface text-fg hover:bg-surface-muted hover:border-gray-400 active:bg-gray-100 disabled:bg-surface-muted disabled:text-fg-subtle disabled:border-line",
  ghost:
    "bg-transparent text-fg-muted hover:bg-surface-muted hover:text-fg active:bg-gray-100 disabled:text-fg-subtle disabled:hover:bg-transparent",
  danger:
    "bg-danger text-white shadow-sm hover:bg-danger-hover disabled:opacity-50 disabled:hover:bg-danger",
  // px-0 va despues del tamano en cn(), asi que twMerge descarta el px-*.
  link: "group bg-transparent px-0 text-primary-700 hover:text-primary-900 disabled:text-fg-subtle",
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
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
    "disabled:cursor-not-allowed",
    sizeStyles[size],
    variantStyles[variant],
    className
  );
}
