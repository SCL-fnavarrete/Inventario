"use client";

import { useEffect } from "react";
import { useToast } from "@/shared/ui/Toast";

/**
 * Una sola sesion por usuario (SPEC 2.127): si al iniciar sesion se cerro
 * otra abierta en otro equipo, el login lo deja anotado aqui y, ya dentro, se
 * avisa una vez. Si no fue la misma persona, sabe que alguien mas tiene su
 * clave.
 */
export const CLAVE_AVISO_OTRA_SESION = "aviso-otra-sesion";

export function AvisoOtraSesion() {
  const toast = useToast();
  useEffect(() => {
    try {
      if (sessionStorage.getItem(CLAVE_AVISO_OTRA_SESION) !== "1") return;
      sessionStorage.removeItem(CLAVE_AVISO_OTRA_SESION);
    } catch {
      return;
    }
    toast.warning(
      "Se cerró tu sesión en otro equipo",
      "Tu usuario estaba abierto en otro lugar. Si no fuiste tú, cambia tu contraseña o avisa a un administrador."
    );
  }, [toast]);
  return null;
}
