"use client";

import { useEffect, useRef, useState } from "react";
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";

/** Evento que avisa que un guardado fallo porque la sesion termino. */
const EVENTO_SESION_PERDIDA = "sesion-perdida-al-guardar";
export const MENSAJE_SESION_PERDIDA =
  "Tu sesión terminó. Inicia sesión en otra pestaña y vuelve a guardar; lo que escribiste sigue aquí.";
const METODOS_ESCRITURA = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Si una consulta a la API responde 401 (la sesion vencio, se cerro o la
 * cuenta se desactivo):
 * - en una lectura, la pantalla va de inmediato al inicio de sesion y esa
 *   respuesta no le llega a quien la pidio: asi ninguna pantalla intenta
 *   leer {"error": "No autorizado"} como si fueran datos;
 * - en un guardado (POST/PUT/PATCH/DELETE) NO se recarga: se perderia lo
 *   que la persona escribio (auditoria 27-sep-2026, 2.8). El formulario
 *   recibe el 401 con un mensaje claro y arriba aparece un aviso con un
 *   enlace para iniciar sesion en otra pestaña.
 * La API responde 401 en vez de redirigir desde SPEC 2.114. Se instala una
 * sola vez, al cargar.
 */
if (typeof window !== "undefined" && !(window as { __salidaPor401?: boolean }).__salidaPor401) {
  (window as { __salidaPor401?: boolean }).__salidaPor401 = true;
  const fetchOriginal = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>) => {
    const respuesta = await fetchOriginal(...args);
    const url = new URL(args[0] instanceof Request ? args[0].url : String(args[0]), window.location.href);
    const esApiPropia = url.origin === window.location.origin && url.pathname.startsWith("/api/") && !url.pathname.startsWith("/api/auth/");
    if (respuesta.status === 401 && esApiPropia && window.location.pathname !== "/login") {
      const metodo = (args[1]?.method ?? (args[0] instanceof Request ? args[0].method : "GET")).toUpperCase();
      if (METODOS_ESCRITURA.has(metodo)) {
        window.dispatchEvent(new Event(EVENTO_SESION_PERDIDA));
        return new Response(JSON.stringify({ error: MENSAJE_SESION_PERDIDA }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa: borra el estado de la pantalla sin sesion
      window.location.href = "/login";
      return new Promise<Response>(() => {});
    }
    return respuesta;
  };
}

/**
 * Sesion en el navegador. Se vuelve a consultar cada 5 minutos (y al
 * volver a la pestaña): si la cuenta se desactivo o la sesion vencio, el
 * servidor ya no la reconoce (SPEC 2.112) y la pantalla va al inicio de
 * sesion. Antes era cada 30 s; no hace falta tan seguido porque la API ya
 * revisa la cuenta en cada accion y responde 401 (auditoria 28-sep-2026, 1.5).
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider refetchInterval={300} refetchOnWindowFocus>
      <SalirSiNoHaySesion />
      {children}
    </NextAuthSessionProvider>
  );
}

function SalirSiNoHaySesion() {
  const { status } = useSession();
  // Un guardado fallo por la sesion: la pantalla se queda (con el aviso)
  // hasta que la persona vuelva a iniciar sesion en otra pestaña. La cookie
  // es compartida, asi que la siguiente consulta de la sesion la ve activa.
  const [guardadoSinSesion, setGuardadoSinSesion] = useState(false);
  const statusAnterior = useRef(status);

  useEffect(() => {
    const avisar = () => setGuardadoSinSesion(true);
    window.addEventListener(EVENTO_SESION_PERDIDA, avisar);
    return () => window.removeEventListener(EVENTO_SESION_PERDIDA, avisar);
  }, []);

  useEffect(() => {
    const anterior = statusAnterior.current;
    statusAnterior.current = status;
    // El aviso se quita solo cuando la sesion VUELVE (de sin sesion a con
    // sesion). Un guardado puede fallar antes de que la revision periodica
    // note que la sesion vencio, y ahi el estado todavia dice "authenticated".
    // eslint-disable-next-line react-hooks/set-state-in-effect -- la sesion volvio: el aviso ya no corresponde
    if (status === "authenticated" && anterior === "unauthenticated") setGuardadoSinSesion(false);
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa: borra el estado de la pantalla sin sesion
    else if (status === "unauthenticated" && !guardadoSinSesion) window.location.href = "/login";
  }, [status, guardadoSinSesion]);

  if (!guardadoSinSesion) return null;
  return (
    <div
      role="alert"
      className="fixed inset-x-4 top-4 z-50 mx-auto max-w-xl rounded-lg border border-line bg-surface px-4 py-3 text-sm text-fg shadow-lg"
    >
      <p>{MENSAJE_SESION_PERDIDA}</p>
      <div className="mt-2 flex items-center gap-4">
        <a href="/login" target="_blank" rel="noopener" className="font-medium text-primary-600 underline">
          Iniciar sesión en otra pestaña
        </a>
        <button type="button" onClick={() => setGuardadoSinSesion(false)} className="text-fg-muted underline">
          Cerrar
        </button>
      </div>
    </div>
  );
}
