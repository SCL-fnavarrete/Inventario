"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { cn } from "@/shared/cn";

type ElementoConTilt = HTMLDivElement & { vanillaTilt?: { destroy(): void } };

/**
 * Inclinacion 3D al pasar el mouse (vanilla-tilt), para tarjetas destacadas
 * y pocas a la vez: KPIs del Dashboard, secciones de Configuracion. No usar
 * en listas grandes (ej. la grilla de Activos): cada instancia escucha
 * mousemove.
 *
 * La libreria se carga con import() dinamico, solo en las pantallas que la
 * usan, y no se activa con prefers-reduced-motion ni en pantallas tactiles.
 * Envuelve a sus hijos en vez de recibir props de la tarjeta, asi las
 * tarjetas siguen siendo componentes de servidor.
 */
export function Tilt({
  children,
  className,
  enabled = true,
}: {
  children: ReactNode;
  className?: string;
  enabled?: boolean;
}) {
  const ref = useRef<ElementoConTilt>(null);

  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el) return;
    const sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const conMouse = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (sinMovimiento || !conMouse) return;

    let cancelado = false;
    import("vanilla-tilt").then(({ default: VanillaTilt }) => {
      if (cancelado) return;
      VanillaTilt.init(el, {
        max: 12,
        speed: 400,
        scale: 1.04,
        perspective: 1000,
        easing: "cubic-bezier(.03,.98,.52,.99)",
        glare: true,
        "max-glare": 0.15,
      });
    });

    return () => {
      cancelado = true;
      el.vanillaTilt?.destroy();
    };
  }, [enabled]);

  return (
    // data-tilt activa la profundidad del contenido (ver card-feature en globals.css).
    <div
      ref={ref}
      data-tilt={enabled ? "" : undefined}
      className={cn("relative rounded-card [transform-style:preserve-3d]", className)}
    >
      {children}
    </div>
  );
}

export default Tilt;
