import type { EstadoGuia, EstadoItemGuia, CondicionActivo } from "@prisma/client";

// Tipos para mostrar en la UI
export interface DispatchGuideAsset {
  id: string;
  numeroSerie: string | null;
  imei: string | null;
  marca: string;
  modelo: string;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  lineas?: { numero: string }[];
  // Specs de Monitor/perifericos, ademas de Notebook/Celular -- ver
  // modules/activos/especificaciones.ts.
  pulgadas: string | number | null;
  conectividad: string | null;
  tipoLicenciaMicrosoft365: string | null;
  condicion: CondicionActivo;
  categoria: {
    id: string;
    nombre: string;
  };
}

export interface DispatchGuideItem {
  id: string;
  assetId: string;
  observaciones: string | null;
  estado: EstadoItemGuia;
  fechaResolucion: Date | null;
  resueltoPor: string | null;
  asset: DispatchGuideAsset;
}

/** Kit/EPP que viaja en un despacho (SPEC 2.111.4): un articulo y cantidades. */
export interface DispatchGuideKitLine {
  id: string;
  itemId: string;
  cantidad: number;
  cantidadRecibida: number;
  cantidadPerdida: number;
  estado: EstadoItemGuia;
  motivoPerdida: string | null;
  fechaResolucion: Date | null;
  resueltoPor: string | null;
  item: { id: string; nombre: string; categoria: string };
  itemDestino: { id: string; nombre: string; cantidad: number } | null;
}

/** Unidades que todavia no se resuelven (ni llegaron ni se perdieron). */
export function pendienteKit(l: Pick<DispatchGuideKitLine, "cantidad" | "cantidadRecibida" | "cantidadPerdida">) {
  return l.cantidad - l.cantidadRecibida - l.cantidadPerdida;
}

export interface DispatchGuideSede {
  id: string;
  nombre: string;
  codigo: string;
}

export interface DispatchGuideListItem {
  id: string;
  numero: string;
  otChilexpress: string;
  despachadoPor: string;
  fechaDespacho: Date;
  receptorNombre: string;
  receptorRut: string;
  estado: EstadoGuia;
  createdAt: Date;
  sede: DispatchGuideSede | null;
  sedeDestino: DispatchGuideSede;
  _count: {
    items: number;
    kitItems: number;
  };
}

export interface DispatchGuideDetail {
  id: string;
  numero: string;
  otChilexpress: string;
  fechaDespacho: Date;
  fechaEstimadaLlegada: Date | null;
  despachadoPor: string;
  receptorNombre: string;
  receptorRut: string;
  observaciones: string | null;
  estado: EstadoGuia;
  fechaRecepcion: Date | null;
  recibidoPor: string | null;
  fechaAnulacion: Date | null;
  anuladaPor: string | null;
  motivoAnulacion: string | null;
  sedeId: string | null;
  sedeDestinoId: string;
  createdAt: Date;
  updatedAt: Date;
  items: DispatchGuideItem[];
  kitItems: DispatchGuideKitLine[];
  // Compra de origen, si el despacho viene de un reparto (SPEC 2.111).
  purchaseId: string | null;
  purchase: { id: string; numeroFactura: string | null } | null;
  sede: DispatchGuideSede | null;
  sedeDestino: DispatchGuideSede;
}

// Nombres y colores para mostrar en la UI (SPEC 2.108).
export const ESTADO_GUIA_LABELS: Record<EstadoGuia, string> = {
  en_transito: "En tránsito",
  recibida_parcial: "Recibido con faltantes",
  recibida: "Completado",
  anulada: "Anulado",
};

export const ESTADO_GUIA_COLORS: Record<EstadoGuia, string> = {
  en_transito: "bg-sky-50 text-sky-800 border border-sky-200",
  recibida_parcial: "bg-amber-50 text-amber-800 border border-amber-200",
  recibida: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  anulada: "bg-gray-100 text-fg-muted border border-line",
};

export const ESTADO_ITEM_GUIA_LABELS: Record<EstadoItemGuia, string> = {
  en_transito: "En tránsito",
  recibido: "Recibido",
  perdido: "Perdido",
};

export const ESTADO_ITEM_GUIA_COLORS: Record<EstadoItemGuia, string> = {
  en_transito: "bg-sky-50 text-sky-800 border border-sky-200",
  recibido: "bg-emerald-50 text-emerald-800 border border-emerald-200",
  perdido: "bg-red-50 text-red-800 border border-red-200",
};
