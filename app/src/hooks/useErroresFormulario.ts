import { useCallback, useState } from "react";
import {
  enfocarPrimerError,
  sinErrores,
  textoResumenErrores,
} from "@/components/ui/CampoFormulario";

/**
 * Validacion por campo de un formulario, igual que en Onboarding: los campos
 * con error se marcan en rojo con su mensaje, arriba va el resumen ("Faltan o
 * están incorrectos: …") y la vista lleva al primer campo con error. El
 * resumen se calcula de los errores vigentes: se acorta al corregir cada campo.
 *
 *   const { errores, resumen, reportar, limpiar } = useErroresFormulario(ETIQUETAS);
 *   if (reportar(validar())) return;   // hay errores: ya se muestran
 */
export function useErroresFormulario(etiquetas: Record<string, string>) {
  const [errores, setErrores] = useState<Record<string, string>>({});

  /** Muestra estos errores (reemplaza los anteriores). true si hay alguno. */
  const reportar = useCallback((nuevos: Record<string, string>) => {
    setErrores(nuevos);
    const hay = Object.keys(nuevos).length > 0;
    if (hay) enfocarPrimerError();
    return hay;
  }, []);

  /** Quita el error de estos campos (al corregirlos). */
  const limpiar = useCallback((...campos: string[]) => {
    setErrores((prev) => sinErrores(prev, ...campos));
  }, []);

  const resumen = Object.keys(errores).length > 0 ? textoResumenErrores(errores, etiquetas) : "";

  return { errores, resumen, reportar, limpiar };
}
