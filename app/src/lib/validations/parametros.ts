import { validarDigitoVerificador } from "./rut";
import { esCorreoValido } from "@/lib/utils/text";

/**
 * Reglas de Configuración > Parámetros (SPEC 2.102), las mismas en la pantalla
 * y en PUT /api/configuracion/parametros. Antes el servidor respondia con el
 * nombre interno del campo ("duracionSesionHoras debe ser...") y no revisaba
 * el RUT ni el correo de la empresa.
 */

/** Limites de los parametros de seguridad: evitan sesiones de 0 horas o bloqueos eternos. */
export const LIMITES_SEGURIDAD = {
  duracionSesionHoras: { etiqueta: "Duración de sesión (horas)", min: 1, max: 720 },
  maxIntentosLogin: { etiqueta: "Intentos máximos de inicio de sesión", min: 1, max: 20 },
  minutosBloqueoLogin: { etiqueta: "Minutos de bloqueo", min: 1, max: 1440 },
} as const;

export const ETIQUETAS_PARAMETROS: Record<string, string> = {
  empresaRut: "RUT de la empresa",
  empresaEmail: "Email de contacto",
  ...Object.fromEntries(Object.entries(LIMITES_SEGURIDAD).map(([k, v]) => [k, v.etiqueta])),
};

type ValoresParametros = {
  empresaRut?: string | null;
  empresaEmail?: string | null;
  duracionSesionHoras?: unknown;
  maxIntentosLogin?: unknown;
  minutosBloqueoLogin?: unknown;
};

/** Errores por campo (vacio si todo esta bien). Los datos de la empresa son opcionales. */
export function validarParametros(v: ValoresParametros): Record<string, string> {
  const errores: Record<string, string> = {};
  if (v.empresaRut?.trim() && !validarDigitoVerificador(v.empresaRut.trim())) {
    errores.empresaRut = "El RUT no es válido (revisa el dígito verificador)";
  }
  if (v.empresaEmail?.trim() && !esCorreoValido(v.empresaEmail)) {
    errores.empresaEmail = "El email no es válido";
  }
  for (const [campo, { min, max }] of Object.entries(LIMITES_SEGURIDAD)) {
    const valor = v[campo as keyof ValoresParametros];
    if (valor === undefined) continue;
    if (!Number.isInteger(valor) || (valor as number) < min || (valor as number) > max) {
      errores[campo] = `Debe ser un número entero entre ${min} y ${max}`;
    }
  }
  return errores;
}
