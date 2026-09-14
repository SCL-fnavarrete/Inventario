"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

/**
 * Selector de sede global (SPEC 2.29, 14-sep-2026).
 *
 * Desde el rediseño de visibilidad, técnico ya no está restringido a su
 * propia sede (ver sedeScope.ts) -- el filtrado por sede pasa a ser un
 * filtro de UI, elegido acá, en vez de una restricción de acceso del
 * backend. `null` significa "todas las sedes" (sin filtro).
 *
 * Un solo selector, en el Sidebar, en vez de uno por pantalla -- se guarda
 * en localStorage para que se mantenga mientras el usuario navega entre
 * módulos, incluso después de recargar la página. Cada pantalla de listado
 * lee `sedeSeleccionada` de este contexto y lo manda como `?sedeId=` a su
 * API (mismo query param que ya usaba admin en /api/activos, ahora
 * extendido al resto de los endpoints de listado).
 */

const CLAVE_STORAGE = "inventario-sede-seleccionada";

interface SedeSeleccionadaContextValue {
  /** null = "todas las sedes" (sin filtro). */
  sedeSeleccionada: string | null;
  setSedeSeleccionada: (sedeId: string | null) => void;
}

const SedeSeleccionadaContext = createContext<SedeSeleccionadaContextValue | undefined>(
  undefined
);

export function SedeSeleccionadaProvider({ children }: { children: React.ReactNode }) {
  // Arranca en null (todas) tanto en el servidor como en el primer render
  // del cliente, para que no haya desajuste de hidratación -- localStorage
  // solo existe en el navegador, se lee recién en el useEffect.
  const [sedeSeleccionada, setSedeSeleccionadaState] = useState<string | null>(null);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_STORAGE);
      if (guardado) setSedeSeleccionadaState(guardado);
    } catch {
      // localStorage puede fallar (modo privado, storage bloqueado) -- no es
      // crítico, simplemente se queda en "todas las sedes".
    }
  }, []);

  const setSedeSeleccionada = useCallback((sedeId: string | null) => {
    setSedeSeleccionadaState(sedeId);
    try {
      if (sedeId) {
        window.localStorage.setItem(CLAVE_STORAGE, sedeId);
      } else {
        window.localStorage.removeItem(CLAVE_STORAGE);
      }
    } catch {
      // Ver comentario de arriba.
    }
  }, []);

  return (
    <SedeSeleccionadaContext.Provider value={{ sedeSeleccionada, setSedeSeleccionada }}>
      {children}
    </SedeSeleccionadaContext.Provider>
  );
}

/** Sede elegida en el selector global del nav, y su setter. */
export function useSedeSeleccionada(): SedeSeleccionadaContextValue {
  const ctx = useContext(SedeSeleccionadaContext);
  if (!ctx) {
    throw new Error("useSedeSeleccionada debe usarse dentro de <SedeSeleccionadaProvider>");
  }
  return ctx;
}
