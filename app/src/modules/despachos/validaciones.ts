import { validarDigitoVerificador } from "@/shared/validaciones/rut";

/**
 * Reglas de una guía de despacho nueva (SPEC 2.104), las mismas en la pantalla
 * y en POST /api/guias-despacho. Antes el servidor respondia solo "Faltan
 * campos requeridos", sin decir cuales.
 */
export const ETIQUETAS_GUIA: Record<string, string> = {
  sedeId: "Sede origen",
  assetIds: "Equipos o Kit / EPP",
  kit: "Kit / EPP",
  otChilexpress: "OT Chilexpress",
  sedeDestinoId: "Sede destino",
  fechaDespacho: "Fecha de envío",
  receptorNombre: "Nombre del receptor",
  receptorRut: "RUT del receptor",
  recibidoPor: "Recibido por",
  fechaRecepcion: "Fecha de recepción",
  llegaron: "Lo que llegó",
  motivo: "Motivo",
};

type DatosGuia = {
  assetIds?: unknown[] | null;
  /** Kit/EPP que sale con el despacho (SPEC 2.145). */
  kit?: unknown[] | null;
  otChilexpress?: string | null;
  sedeDestinoId?: string | null;
  fechaDespacho?: string | null;
  receptorNombre?: string | null;
  receptorRut?: string | null;
};

/** Errores por campo de una guia nueva (vacio si esta completa). */
export function validarNuevaGuia(d: DatosGuia): Record<string, string> {
  const e: Record<string, string> = {};
  // Un despacho lleva equipos, Kit/EPP o ambos (SPEC 2.145).
  if (!d.assetIds?.length && !d.kit?.length) e.assetIds = "Elige al menos un equipo o un artículo de Kit/EPP";
  return { ...e, ...validarDatosDespacho(d) };
}

/**
 * Datos del envio, sin los equipos: los comparten el despacho del modulo y
 * el despacho que crea el reparto de una compra (SPEC 2.111), que puede
 * llevar solo Kit/EPP.
 */
export function validarDatosDespacho(d: Omit<DatosGuia, "assetIds" | "kit">): Record<string, string> {
  const e: Record<string, string> = {};
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

/**
 * Confirmar la recepcion (SPEC 2.108): la fecha de recepcion no puede ser anterior al envio (un paquete no llega
 * antes de salir). Las fechas son instantes exactos (ISO) o Date.
 */
export function validarRecepcion(
  d: { fechaRecepcion?: string | Date | null },
  fechaDespacho: string | Date
): Record<string, string> {
  const e: Record<string, string> = {};
  if (d.fechaRecepcion && new Date(d.fechaRecepcion) < new Date(fechaDespacho)) {
    e.fechaRecepcion = "La recepción no puede ser anterior a la fecha de envío";
  }
  return e;
}
