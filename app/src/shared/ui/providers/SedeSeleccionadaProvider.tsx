"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { SEDE_COOKIE } from "@/shared/sedes/constantes";

/**
 * Selector de sede global. La sede es solo un filtro (SPEC 2.117): todos
 * los usuarios eligen una sede o "todas". `null` significa "todas las sedes".
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
 * Es solo un filtro de presentacion, no una credencial. `SameSite=Lax`
 * y sin `Secure` para que funcione igual en http://localhost.
 */
const CLAVE_COOKIE = SEDE_COOKIE;
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

/**
 * Al iniciar sesion el filtro vuelve a "Todas las sedes" (SPEC 2.161): se
 * olvida la sede elegida en la sesion anterior. Lo llama la pantalla de login.
 */
export function olvidarSedeSeleccionada() {
  try {
    window.localStorage.removeItem(CLAVE_STORAGE);
  } catch {
    // Sin almacenamiento del navegador no hay nada que olvidar.
  }
  escribirCookie(null);
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
  // Arranca en null (todas) en servidor y en el primer render del cliente
  // para evitar desajuste de hidratación; localStorage se lee en el useEffect.
  const [sedeSeleccionada, setSedeSeleccionadaState] = useState<string | null>(null);

  const router = useRouter();

  useEffect(() => {
    try {
      // Lectura de localStorage tras el montaje, a proposito: el servidor no
      // tiene localStorage, asi que el estado arranca en null y se actualiza
      // recien aca para evitar un mismatch de hidratacion. "" guardado es
      // "todas las sedes", igual que sin nada guardado (recien iniciada la
      // sesion, SPEC 2.161).
      const inicial = window.localStorage.getItem(CLAVE_STORAGE);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSedeSeleccionadaState(inicial || null);
      // La cookie puede haberse perdido mientras localStorage sigue teniendo la
      // sede: se re-sincroniza para que el Dashboard (server component) vea lo
      // mismo que el resto.
      escribirCookie(inicial || null);
    } catch {
      // localStorage puede fallar (modo privado, storage bloqueado) -- no es
      // crítico, simplemente se queda en "todas las sedes".
    }
  }, []);

  const setSedeSeleccionada = useCallback(
    (sedeId: string | null) => {
      setSedeSeleccionadaState(sedeId);
      try {
        window.localStorage.setItem(CLAVE_STORAGE, sedeId ?? "");
        escribirCookie(sedeId);
      } catch {
        // Ver comentario de arriba.
      }
      // El Dashboard es un server component: lee la sede de la cookie, no de
      // este contexto, asi que hay que pedirle a Next que lo vuelva a
      // renderizar.
      router.refresh();
    },
    [router]
  );

  return (
    <SedeSeleccionadaContext.Provider
      value={{ sedeSeleccionada, setSedeSeleccionada }}
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

/**
 * Sede por defecto para un registro nuevo (SPEC 2.80): la del navbar; si el
 * navbar esta en "Todas las sedes", la propia de la sesion; si tampoco hay,
 * "" (el formulario exige elegirla). `lista` es false mientras carga la
 * sesion: hasta entonces el valor todavia puede cambiar.
 */
export function useSedePorDefecto(): { sedeId: string; lista: boolean } {
  const { sedeSeleccionada } = useSedeSeleccionada();
  const { data: session, status } = useSession();
  return {
    sedeId: sedeSeleccionada ?? session?.user?.sedeId ?? "",
    lista: status !== "loading",
  };
}

/**
 * Estado del campo Sede de un formulario de creacion. Mientras no se toque,
 * el valor ES la sede por defecto (estado derivado, sin effects): si la del
 * navbar llega tarde por la hidratacion, el campo se completa solo. Una vez
 * fijado con el setter (a mano, o por codigo como la sede del empleado en
 * offboarding), un cambio del navbar ya no lo pisa. `reiniciar` vuelve a
 * seguir el default, para formularios que se reabren con otro registro.
 */
export function useCampoSede() {
  const { sedeId: porDefecto } = useSedePorDefecto();
  const [manual, setManual] = useState<string | null>(null);
  const setSede = useCallback((sedeId: string) => setManual(sedeId), []);
  const reiniciar = useCallback(() => setManual(null), []);
  return [manual ?? porDefecto, setSede, reiniciar] as const;
}
