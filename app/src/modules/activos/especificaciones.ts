/**
 * Especificaciones de un activo segun su categoria, en un solo lugar: es la
 * unica fuente de verdad de que campos le corresponden a cada activo, para
 * que todas las pantallas que muestran specs queden sincronizadas.
 */

import { formatearNumero } from "@/modules/lineas";

export type ActivoParaSpecs = {
  procesador?: string | null;
  ram?: string | null;
  discoDuro?: string | null;
  sistemaOperativo?: string | null;
  imei?: string | null;
  // Lineas activas del celular (SPEC 2.131).
  lineas?: { numero: string; plan: string | null }[];
  pulgadas?: string | number | null;
  conectividad?: string | null;
  tipoLicenciaMicrosoft365?: string | null;
};

export type EspecificacionEtiquetada = { etiqueta: string; valor: string };

// Mismas etiquetas que usa el select de conectividad en /activos/nuevo
// (usb/bluetooth/cable -> USB/Bluetooth/Cable).
const ETIQUETAS_CONECTIVIDAD: Record<string, string> = {
  usb: "USB",
  bluetooth: "Bluetooth",
  cable: "Cable",
};

export function etiquetaConectividad(valor: string): string {
  return ETIQUETAS_CONECTIVIDAD[valor] || valor;
}

/** Lineas de un celular en una frase: "+56 9 1234 5678 (Plan X)". */
export function textoLineas(lineas: { numero: string; plan: string | null }[]): string {
  return lineas.map((l) => formatearNumero(l.numero) + (l.plan ? ` (${l.plan})` : "")).join(", ");
}

export function especificacionesActivo(a: ActivoParaSpecs): EspecificacionEtiquetada[] {
  const partes: EspecificacionEtiquetada[] = [];
  if (a.procesador) partes.push({ etiqueta: "Procesador", valor: a.procesador });
  if (a.ram) partes.push({ etiqueta: "Memoria RAM", valor: a.ram });
  if (a.discoDuro) partes.push({ etiqueta: "Disco", valor: a.discoDuro });
  if (a.sistemaOperativo) partes.push({ etiqueta: "Sistema Operativo", valor: a.sistemaOperativo });
  if (a.imei) partes.push({ etiqueta: "IMEI", valor: a.imei });
  if (a.lineas?.length) partes.push({ etiqueta: "Línea", valor: textoLineas(a.lineas) });
  if (a.pulgadas) partes.push({ etiqueta: "Pantalla", valor: `${a.pulgadas}"` });
  if (a.conectividad) {
    partes.push({ etiqueta: "Conectividad", valor: etiquetaConectividad(a.conectividad) });
  }
  if (a.tipoLicenciaMicrosoft365) {
    partes.push({ etiqueta: "Microsoft 365", valor: a.tipoLicenciaMicrosoft365 });
  }
  return partes;
}

export function especificacionesActivoTexto(a: ActivoParaSpecs): string {
  return especificacionesActivo(a)
    .map(({ etiqueta, valor }) => `${etiqueta}: ${valor}`)
    .join(" · ");
}
