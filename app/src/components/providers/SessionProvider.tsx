"use client";

import { useEffect } from "react";
import { SessionProvider as NextAuthSessionProvider, useSession } from "next-auth/react";

/**
 * Sesion en el navegador. Se vuelve a consultar cada 30 segundos (y al
 * volver a la pestaña): si la cuenta se desactivo o la sesion vencio, el
 * servidor ya no la reconoce (SPEC 2.112) y la pantalla va al inicio de
 * sesion, en vez de quedarse mostrando datos con acciones que fallan.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextAuthSessionProvider refetchInterval={30} refetchOnWindowFocus>
      <SalirSiNoHaySesion />
      {children}
    </NextAuthSessionProvider>
  );
}

function SalirSiNoHaySesion() {
  const { status } = useSession();
  useEffect(() => {
    if (status === "unauthenticated") window.location.href = "/login";
  }, [status]);
  return null;
}
