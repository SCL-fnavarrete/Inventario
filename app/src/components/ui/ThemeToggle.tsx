"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { aplicarTema, type Tema } from "@/lib/tema";

// El tema vive en <html data-theme>, no en estado de React: lo fija el
// script de <head> antes de hidratar. Se lee con useSyncExternalStore y se
// observa el atributo, asi cualquier toggle montado refleja el cambio sin
// estado duplicado.
function suscribir(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

const leerTema = (): Tema =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

// En el servidor no se conoce el tema: null muestra el icono neutro.
const temaServidor = () => null;

/** Boton luna/sol que alterna entre tema claro y oscuro. */
export function ThemeToggle({ className }: { className?: string }) {
  const tema = useSyncExternalStore(suscribir, leerTema, temaServidor);
  const siguiente: Tema = tema === "dark" ? "light" : "dark";
  const etiqueta = siguiente === "dark" ? "Activar modo oscuro" : "Activar modo claro";

  return (
    <button
      type="button"
      onClick={() => aplicarTema(siguiente)}
      aria-label={etiqueta}
      title={etiqueta}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg",
        className
      )}
    >
      {tema === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

export default ThemeToggle;
