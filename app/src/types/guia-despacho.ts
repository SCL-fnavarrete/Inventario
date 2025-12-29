import { TipoDespacho, EstadoGuia, CondicionActivo } from "@prisma/client";

// Tipos para crear/editar guías
export interface CreateDispatchGuideInput {
  origen: string;
  destino: string;
  tipoDespacho: TipoDespacho;
  despachadoPor: string;
  fechaDespacho: Date | string;
  destinatarioId?: string;
  destinatarioNombre?: string;
  destinatarioRut?: string;
  observaciones?: string;
  assetIds: string[];
}

export interface UpdateDispatchGuideInput {
  estado?: EstadoGuia;
  fechaRecepcion?: Date | string;
  recibidoPor?: string;
  observaciones?: string;
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

export interface DispatchGuideDestinatario {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  cargo: string | null;
  ubicacion: string | null;
  correo: string;
}

export interface DispatchGuideListItem {
  id: string;
  numero: string;
  origen: string;
  destino: string;
  tipoDespacho: TipoDespacho;
  despachadoPor: string;
  fechaDespacho: Date;
  destinatarioNombre: string | null;
  estado: EstadoGuia;
  createdAt: Date;
  _count: {
    items: number;
  };
}

export interface DispatchGuideDetail {
  id: string;
  numero: string;
  origen: string;
  destino: string;
  tipoDespacho: TipoDespacho;
  despachadoPor: string;
  fechaDespacho: Date;
  destinatarioId: string | null;
  destinatarioNombre: string | null;
  destinatarioRut: string | null;
  observaciones: string | null;
  estado: EstadoGuia;
  fechaRecepcion: Date | null;
  recibidoPor: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: DispatchGuideItem[];
  destinatario: DispatchGuideDestinatario | null;
}

// Labels para mostrar en la UI
export const TIPO_DESPACHO_LABELS: Record<TipoDespacho, string> = {
  asignacion: "Asignación",
  traslado: "Traslado",
  prestamo: "Préstamo",
};

export const ESTADO_GUIA_LABELS: Record<EstadoGuia, string> = {
  pendiente: "Pendiente",
  despachado: "Despachado",
  recibido: "Recibido",
  anulado: "Anulado",
};

export const ESTADO_GUIA_COLORS: Record<EstadoGuia, string> = {
  pendiente: "bg-yellow-100 text-yellow-800",
  despachado: "bg-blue-100 text-blue-800",
  recibido: "bg-green-100 text-green-800",
  anulado: "bg-red-100 text-red-800",
};
