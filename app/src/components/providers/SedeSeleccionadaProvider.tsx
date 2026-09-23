"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Selector de sede global. El filtrado por sede es un filtro de UI elegido
 * acá (ver sedeScope.ts para el control de acceso real en el backend).
 * `null` significa "todas las sedes" (sin filtro).
 *
 * Un solo selector, en el Navbar, persistido en localStorage para que se
 * mantenga entre navegaciones y recargas. Cada pantalla de listado lee
 * `sedeSeleccionada` de este contexto y lo manda como `?sedeId=` a su API.
 */

const CLAVE_STORAGE = "inventario-sede-seleccionada";

/**
 * La misma sede viaja tambien en una cookie, para que el Dashboard (server
 * component, sin acceso a localStorage) pueda leerla en el servidor.
 *
 * Es solo un filtro de presentacion, no una credencial: el backend igual
 * valida con la sesion quien puede ver que (ver sedeScope.ts). `SameSite=Lax`
 * y sin `Secure` para que funcione igual en http://localhost.
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
  /**
   * true cuando el usuario no puede cambiar de sede porque su sesion la fija
   * (cualquiera que no sea admin). El selector del nav la muestra bloqueada.
   */
  sedeBloqueada: boolean;
}

const SedeSeleccionadaContext = createContext<SedeSeleccionadaContextValue | undefined>(
  undefined
);

export function SedeSeleccionadaProvider({ children }: { children: React.ReactNode }) {
  // Arranca en null (todas) en servidor y en el primer render del cliente
  // para evitar desajuste de hidratación; localStorage se lee en el useEffect.
  const [sedeSeleccionada, setSedeSeleccionadaState] = useState<string | null>(null);

  const router = useRouter();
  const { data: session } = useSession();
  // Solo admin elige sede; para el resto, la sede de su sesion manda y el
  // selector queda bloqueado (el backend lo hace cumplir, ver sedeScope.ts).
  const sedeBloqueada = !!session && session.user?.role !== "admin";
  const sedePropia = session?.user?.sedeId ?? null;

  // Valor efectivo que ve el resto de la app: si la sede esta bloqueada,
  // siempre es la propia de la sesion, sin importar lo que haya quedado en
  // `sedeSeleccionada`. Se calcula en cada render (estado derivado) en vez
  // de sincronizarlo con un setState en un effect, evitando un frame
  // intermedio con la sede vieja.
  const sedeEfectiva = sedeBloqueada && sedePropia ? sedePropia : sedeSeleccionada;

  // Esto si es un efecto legitimo: sincroniza sistemas externos
  // (localStorage y la cookie que lee el Dashboard en el servidor) con la
  // sede bloqueada, no calcula estado de React.
  useEffect(() => {
    if (!sedeBloqueada || !sedePropia) return;
    try {
      window.localStorage.setItem(CLAVE_STORAGE, sedePropia);
      escribirCookie(sedePropia);
    } catch {
      // Ver comentario de abajo: no es critico.
    }
  }, [sedeBloqueada, sedePropia]);

  useEffect(() => {
    try {
      const guardado = window.localStorage.getItem(CLAVE_STORAGE);

      // Lectura de localStorage tras el montaje, a proposito: el servidor no
      // tiene localStorage, asi que el estado arranca en null y se actualiza
      // recien aca para evitar un mismatch de hidratacion.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (guardado) setSedeSeleccionadaState(guardado);
      // La cookie puede haberse perdido mientras localStorage sigue teniendo la
      // sede: se re-sincroniza al montar para que el Dashboard (server
      // component) vea lo mismo que el resto.
      escribirCookie(guardado);
    } catch {
      // localStorage puede fallar (modo privado, storage bloqueado) -- no es
      // crítico, simplemente se queda en "todas las sedes".
    }
  }, []);

  const setSedeSeleccionada = useCallback(
    (sedeId: string | null) => {
      // Quien tiene la sede fija no puede cambiarla ni por codigo: el
      // selector ya viene bloqueado, esto cubre cualquier otro llamador.
      if (sedeBloqueada) return;
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
      // renderizar.
      router.refresh();
    },
    [router, sedeBloqueada]
  );

  return (
    <SedeSeleccionadaContext.Provider
      value={{ sedeSeleccionada: sedeEfectiva, setSedeSeleccionada, sedeBloqueada }}
    >
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
