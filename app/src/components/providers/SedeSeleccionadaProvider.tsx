"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

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

/**
 * La misma sede viaja tambien en una cookie (15-sep-2026, QA funcional,
 * SPEC 2.38). Motivo: el Dashboard es un server component y consulta la base
 * de datos en el servidor, donde no existe localStorage -- por eso el
 * Resumen ignoraba el selector y seguia mostrando los totales de todas las
 * sedes mientras el resto de las pantallas ya filtraban bien.
 *
 * Es solo un filtro de presentacion, no una credencial: el backend igual
 * valida con la sesion quien puede ver que (ver sedeScope.ts), asi que una
 * cookie manipulada no da acceso a nada nuevo. `SameSite=Lax` y sin
 * `Secure` para que funcione igual en http://localhost.
 */
const CLAVE_COOKIE = "inventario-sede-seleccionada";
const DIAS_COOKIE = 365;

function escribirCookie(sedeId: string | null) {
  if (typeof document === "undefined") return;
  if (sedeId) {
    const maxAge = DIAS_COOKIE * 24 * 60 * 60;
    document.cookie = `${CLAVE_COOKIE}=${encodeURIComponent(sedeId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } else {
    document.cookie = `${CLAVE_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

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

  const router = useRouter();

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_STORAGE);

      // Lectura de localStorage tras el montaje, a proposito: el servidor no
      // tiene localStorage, asi que el estado arranca en null y se actualiza
      // recien aca para evitar un mismatch de hidratacion.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado) setSedeSeleccionadaState(guardado);
      // La cookie puede haberse perdido (expiro, otro navegador) mientras
      // localStorage sigue teniendo la sede: se re-sincroniza al montar para
      // que el Dashboard (server component) vea lo mismo que el resto.
      escribirCookie(guardado);
    } catch {
      // localStorage puede fallar (modo privado, storage bloqueado) -- no es
      // crítico, simplemente se queda en "todas las sedes".
    }
  }, []);

  const setSedeSeleccionada = useCallback(
    (sedeId: string | null) => {
      setSedeSeleccionadaState(sedeId);
      try {
        if (sedeId) {
          window.localStorage.setItem(CLAVE_STORAGE, sedeId);
        } else {
          window.localStorage.removeItem(CLAVE_STORAGE);
        }
        escribirCookie(sedeId);
      } catch {
        // Ver comentario de arriba.
      }
      // El Dashboard es un server component: lee la sede de la cookie, no de
      // este contexto, asi que hay que pedirle a Next que lo vuelva a
      // renderizar. Sin esto, el Resumen seguia mostrando los totales de
      // todas las sedes despues de cambiar el selector (15-sep-2026, QA
      // funcional, SPEC 2.38).
      router.refresh();
    },
    [router]
  );

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
