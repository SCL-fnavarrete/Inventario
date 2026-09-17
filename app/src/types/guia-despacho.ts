import { EstadoGuia, CondicionActivo } from "@prisma/client";

// Tipos para crear/confirmar guías
export interface CreateDispatchGuideInput {
  otChilexpress: string;
  fechaDespacho: Date | string;
  fechaEstimadaLlegada?: Date | string | null;
  receptorNombre: string;
  receptorRut: string;
  observaciones?: string;
  sedeDestinoId: string;
  assetIds: string[];
}

export interface ConfirmarRecepcionInput {
  recibidoPor: string;
  fechaRecepcion?: Date | string;
}

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
  numeroTelefono: string | null;
  tipoPlan: string | null;
  // Faltaban Monitor/perifericos (14-sep-2026, SPEC 2.26): la vista de
  // detalle de una guia solo sabia mostrar specs de Notebook/Celular, pese
  // a que la API ya devolvia estos campos -- ver assetSpecs.ts.
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
  asset: DispatchGuideAsset;
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
  createdAt: Date;
  updatedAt: Date;
  items: DispatchGuideItem[];
  sede: DispatchGuideSede | null;
  sedeDestino: DispatchGuideSede;
}

// Labels para mostrar en la UI
export const ESTADO_GUIA_LABELS: Record<EstadoGuia, string> = {
  despachado: "Despachado",
  realizado: "Realizado",
};

export const ESTADO_GUIA_COLORS: Record<EstadoGuia, string> = {
  despachado: "bg-blue-100 text-blue-800",
  realizado: "bg-green-100 text-green-800",
};
