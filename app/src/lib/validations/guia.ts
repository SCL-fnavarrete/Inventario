import { validarDigitoVerificador } from "./rut";

/**
 * Reglas de una guía de despacho nueva (SPEC 2.104), las mismas en la pantalla
 * y en POST /api/guias-despacho. Antes el servidor respondia solo "Faltan
 * campos requeridos", sin decir cuales.
 */
export const ETIQUETAS_GUIA: Record<string, string> = {
  sedeId: "Sede origen",
  assetIds: "Equipos a despachar",
  otChilexpress: "OT Chilexpress",
  sedeDestinoId: "Sede destino",
  fechaDespacho: "Fecha de envío",
  receptorNombre: "Nombre del receptor",
  receptorRut: "RUT del receptor",
  recibidoPor: "Recibido por",
};

type DatosGuia = {
  assetIds?: unknown[] | null;
  otChilexpress?: string | null;
  sedeDestinoId?: string | null;
  fechaDespacho?: string | null;
  receptorNombre?: string | null;
  receptorRut?: string | null;
};

/** Errores por campo de una guia nueva (vacio si esta completa). */
export function validarNuevaGuia(d: DatosGuia): Record<string, string> {
  const e: Record<string, string> = {};
  if (!d.assetIds || d.assetIds.length === 0) e.assetIds = "Elige al menos un equipo";
  if (!d.otChilexpress?.trim()) e.otChilexpress = "Escribe la OT de Chilexpress";
  if (!d.sedeDestinoId) e.sedeDestinoId = "Elige la sede destino";
  if (!d.fechaDespacho) e.fechaDespacho = "Elige la fecha de envío";
  if (!d.receptorNombre?.trim()) e.receptorNombre = "Escribe quién recibe";
  if (!d.receptorRut?.trim()) e.receptorRut = "Escribe el RUT de quien recibe";
  else if (!validarDigitoVerificador(d.receptorRut.trim())) {
    e.receptorRut = "El RUT no es válido (revisa el dígito verificador)";
  }
  return e;
}
