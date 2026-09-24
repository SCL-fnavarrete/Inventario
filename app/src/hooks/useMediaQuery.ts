import { useCallback, useSyncExternalStore } from "react";

/** Pantalla de celular: bajo el punto md de Tailwind (768px). */
export const CONSULTA_CELULAR = "(max-width: 767px)";

/**
 * Si la pantalla cumple una media query. En el servidor responde false y al
 * hidratar toma el valor real; sigue los cambios (girar el celular, cambiar
 * el tamano de la ventana). Sin efectos ni estado propio: useSyncExternalStore,
 * igual que el tema y el scroll de la barra.
 */
export function useMediaQuery(consulta: string): boolean {
  const suscribir = useCallback(
    (aviso: () => void) => {
      const mq = window.matchMedia(consulta);
      mq.addEventListener("change", aviso);
      return () => mq.removeEventListener("change", aviso);
    },
    [consulta]
  );
  return useSyncExternalStore(
    suscribir,
    () => window.matchMedia(consulta).matches,
    () => false
  );
}
