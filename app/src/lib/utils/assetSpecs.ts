/**
 * Especificaciones de un activo segun su categoria, en un solo lugar: es la
 * unica fuente de verdad de que campos le corresponden a cada activo, para
 * que todas las pantallas que muestran specs queden sincronizadas.
 */

export type ActivoParaSpecs = {
  procesador?: string | null;
  ram?: string | null;
  discoDuro?: string | null;
  sistemaOperativo?: string | null;
  imei?: string | null;
  numeroTelefono?: string | null;
  tipoPlan?: string | null;
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

export function especificacionesActivo(a: ActivoParaSpecs): EspecificacionEtiquetada[] {
  const partes: EspecificacionEtiquetada[] = [];
  if (a.procesador) partes.push({ etiqueta: "Procesador", valor: a.procesador });
  if (a.ram) partes.push({ etiqueta: "Memoria RAM", valor: a.ram });
  if (a.discoDuro) partes.push({ etiqueta: "Disco", valor: a.discoDuro });
  if (a.sistemaOperativo) partes.push({ etiqueta: "Sistema Operativo", valor: a.sistemaOperativo });
  if (a.imei) partes.push({ etiqueta: "IMEI", valor: a.imei });
  if (a.numeroTelefono) partes.push({ etiqueta: "Número", valor: a.numeroTelefono });
  if (a.tipoPlan) partes.push({ etiqueta: "Plan", valor: a.tipoPlan });
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
