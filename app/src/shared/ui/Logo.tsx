import Image from "next/image";
import { cn } from "@/shared/cn";

/**
 * Logo oficial de SCL Consultores (sclconsultores.com/logo.png). El alto se
 * controla con className (ej. "h-9"). En modo oscuro va sobre una pastilla
 * clara: el "CONSULTORES" gris del logo no se lee sobre fondo oscuro, y el
 * archivo de marca no se edita.
 */
export function Logo({ className, priority }: { className?: string; priority?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-control dark:bg-white dark:px-2 dark:py-1",
        className
      )}
    >
      <Image
        src="/logo-scl.png"
        alt="SCL Consultores"
        width={2420}
        height={627}
        className="h-full w-auto"
        priority={priority}
      />
    </span>
  );
}

export default Logo;
