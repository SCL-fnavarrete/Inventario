"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { buttonClasses } from "@/components/ui/buttonStyles";

/**
 * Error inesperado al mostrar una pantalla del sistema (auditoria
 * 27-sep-2026, 6.1). Antes se veia la pagina generica de Next en ingles y sin
 * forma de volver. Queda dentro del layout, asi que el menu sigue disponible.
 * `retry` vuelve a pedir los datos: sirve cuando el problema fue momentaneo.
 */
export default function ErrorPantalla({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="card mx-auto mt-16 max-w-lg p-8 text-center">
      <h1 className="text-xl font-bold text-fg">No se pudo cargar esta pantalla</h1>
      <p className="mt-2 text-sm text-fg-muted">
        Puede ser un problema momentáneo de conexión. Si vuelve a pasar, avisa a soporte
        {error.digest ? (
          <>
            {" "}con este código: <strong className="font-mono text-fg">{error.digest}</strong>
          </>
        ) : null}
        .
      </p>
      <div className="mt-6 flex justify-center gap-3">
        <Button onClick={() => retry()}>Reintentar</Button>
        <Link href="/" className={buttonClasses({ variant: "outline" })}>
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
