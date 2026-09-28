"use client";

import { useCallback, useRef, useState } from "react";

/**
 * Ejecuta una accion de guardado una sola vez a la vez (auditoria
 * 27-sep-2026, 6.2): un doble clic, o apretar Enter y clic, ya no envia dos
 * veces. `enviando` sirve para deshabilitar el boton y mostrar su indicador
 * (`<Button loading={enviando}>`).
 *
 * El candado es un ref y no el estado: el estado se actualiza en el
 * siguiente render, y dos clics muy seguidos alcanzarian a pasar los dos.
 */
export function useEnvio() {
  const [enviando, setEnviando] = useState(false);
  const enCurso = useRef(false);

  const ejecutar = useCallback(async (accion: () => Promise<unknown>) => {
    if (enCurso.current) return;
    enCurso.current = true;
    setEnviando(true);
    try {
      await accion();
    } finally {
      enCurso.current = false;
      setEnviando(false);
    }
  }, []);

  return { enviando, ejecutar };
}
