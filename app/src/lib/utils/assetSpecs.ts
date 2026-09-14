/**
 * Especificaciones de un activo segun su categoria, en un solo lugar.
 *
 * Antes cada pantalla (Excel, selector de Guias de Despacho, los dos
 * selectores de Solicitudes) tenia su propia lista de campos a mostrar --
 * casi todas copiadas de la misma logica pero incompletas o
 * desincronizadas entre si (ver SPEC 2.11 "fuera de alcance" y su
 * extension en SPEC 2.19): Monitor (pulgadas) y los perifericos
 * Mouse/Teclado/Webcam/Audifonos (conectividad) quedaban afuera en varios
 * lugares aunque el dato ya existiera en la base, y Solicitudes mostraba
 * las specs con formato distinto entre sus dos selectores.
 *
 * Esta funcion es la unica fuente de verdad de "que campos le corresponden
 * a este activo": si se agrega un campo nuevo a una categoria, se agrega
 * aca y las pantallas que la usan lo heredan solas, en vez de tener que
 * acordarse de tocar cada pantalla una por una (14-sep-2026).
 *
 * El campo `operador` (Entel/Movistar/etc) que tuvo Celular se elimino el
 * mismo dia (14-sep-2026, SPEC 2.20, pedido explicito de Javier) -- si se
 * ve historicamente en SPEC 2.19 o en migraciones anteriores, ya no existe.
 *
 * `tipoLicenciaMicrosoft365` se agrego el mismo dia (SPEC 2.23): el Excel de
 * Notebooks trae el nombre del plan ("Premium", etc) y antes se perdia --
 * el sistema solo guardaba un booleano Si/No (`microsoft365`).
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
