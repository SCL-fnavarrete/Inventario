"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  UserCheck,
  UserX,
  Wrench,
  XCircle,
  DollarSign,
  Loader2,
  GripVertical,
  Truck,
  PackageOpen,
} from "lucide-react";
import { AssetCard } from "@/modules/activos/componentes/AssetCard";
import type { EstadoActivo, CondicionActivo } from "@prisma/client";

interface AssetData {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  estado: EstadoActivo;
  condicion: CondicionActivo;
  procesador?: string | null;
  ram?: string | null;
  discoDuro?: string | null;
  categoria: {
    id: string;
    nombre: string;
  };
  empleadoActual?: {
    id: string;
    nombres: string;
    apellidoPaterno: string;
    // Identificador visible de la persona.
    correoEmpresa?: string | null;
    correoPersonal?: string | null;
    cargo?: string | null;
  } | null;
}

interface KanbanBoardProps {
  assets: AssetData[];
  onStatusChange?: (assetId: string, newStatus: string) => Promise<void>;
  isUpdating?: boolean;
}

type StatusType = EstadoActivo;

const columns: {
  id: StatusType;
  label: string;
  // Solo para ver: no se puede soltar un equipo ahi (se llega por su proceso).
  soloLectura?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  borderColor: string;
}[] = [
  {
    id: "disponible",
    label: "Disponible",
    icon: CheckCircle,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
  },
  {
    id: "asignado",
    label: "Asignado",
    icon: UserCheck,
    color: "text-primary-700",
    bgColor: "bg-primary-50",
    borderColor: "border-primary-200",
  },
  {
    id: "en_mantencion",
    label: "Mantenci\u00f3n",
    icon: Wrench,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
  },
  {
    id: "no_devuelto",
    label: "No devuelto",
    icon: UserX,
    color: "text-orange-600",
    bgColor: "bg-orange-50",
    borderColor: "border-orange-200",
    soloLectura: true,
  },
  {
    // Recien comprado (SPEC 2.111): se reparte desde su compra, no desde aqui.
    id: "por_repartir",
    label: "Por repartir",
    icon: PackageOpen,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
    soloLectura: true,
  },
  {
    // Viaja en una guia de despacho (SPEC 2.108): llega o se pierde en la guia.
    id: "en_transito",
    label: "En tránsito",
    icon: Truck,
    color: "text-sky-600",
    bgColor: "bg-sky-50",
    borderColor: "border-sky-200",
    soloLectura: true,
  },
  {
    id: "baja",
    label: "Baja",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
  {
    id: "vendido",
    label: "Vendido",
    icon: DollarSign,
    color: "text-fg-muted",
    bgColor: "bg-surface-muted",
    borderColor: "border-line",
    soloLectura: true,
  },
];

export function KanbanBoard({ assets, onStatusChange, isUpdating }: KanbanBoardProps) {
  const router = useRouter();
  const [draggedAssetId, setDraggedAssetId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, assetId: string) => {
    setDraggedAssetId(assetId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", assetId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, columnId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverColumn(columnId);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOverColumn(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, newStatus: StatusType) => {
    e.preventDefault();
    const assetId = e.dataTransfer.getData("text/plain");
    const asset = assets.find((a) => a.id === assetId);

    if (asset && asset.estado !== newStatus && onStatusChange) {
      await onStatusChange(assetId, newStatus);
    }

    setDraggedAssetId(null);
    setDragOverColumn(null);
  }, [assets, onStatusChange]);

  const handleDragEnd = useCallback(() => {
    setDraggedAssetId(null);
    setDragOverColumn(null);
  }, []);

  // Group assets by status
  const assetsByStatus = columns.reduce<Record<StatusType, AssetData[]>>(
    (acc, col) => {
      acc[col.id] = assets.filter((a) => a.estado === col.id);
      return acc;
    },
    { disponible: [], asignado: [], en_mantencion: [], no_devuelto: [], en_transito: [], por_repartir: [], baja: [], vendido: [] }
  );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4 min-h-[500px]">
      {columns.map((column) => {
        const Icon = column.icon;
        const columnAssets = assetsByStatus[column.id];
        const isDragOver = dragOverColumn === column.id;

        return (
          <div
            key={column.id}
            className={`
              flex-shrink-0 w-72 rounded-xl border-2 transition-all duration-200
              ${isDragOver ? `${column.borderColor} ${column.bgColor}` : "border-line bg-surface-muted"}
            `}
            // Una columna de solo lectura no acepta equipos: sin preventDefault
            // el navegador no permite soltar.
            onDragOver={column.soloLectura ? undefined : (e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={column.soloLectura ? undefined : (e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className={`
              p-3 border-b-2 rounded-t-lg
              ${isDragOver ? column.borderColor : "border-line"}
              ${isDragOver ? column.bgColor : "bg-surface"}
            `}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${column.color}`} />
                  <span className="font-semibold text-fg">{column.label}</span>
                </div>
                <span className={`
                  px-2.5 py-0.5 rounded-full text-sm font-medium
                  ${column.bgColor} ${column.color}
                `}>
                  {columnAssets.length}
                </span>
              </div>
            </div>

            {/* Column Content */}
            <div className="p-2 space-y-2 max-h-[600px] overflow-y-auto">
              {columnAssets.length === 0 ? (
                <div className={`
                  p-8 text-center text-fg-subtle border-2 border-dashed rounded-lg
                  ${isDragOver ? column.borderColor : "border-line"}
                `}>
                  <Icon className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">
                    {isDragOver ? "Suelta aqu\u00ed" : "Sin activos"}
                  </p>
                </div>
              ) : (
                columnAssets.map((asset) => (
                  <div
                    key={asset.id}
                    draggable={!!onStatusChange && !isUpdating}
                    onDragStart={(e) => handleDragStart(e, asset.id)}
                    onDragEnd={handleDragEnd}
                    // Clic abre el detalle; el navegador no dispara clic tras
                    // arrastrar, asi que no se confunde con mover la tarjeta.
                    onClick={() => router.push(`/activos/${asset.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") router.push(`/activos/${asset.id}`);
                    }}
                    role="link"
                    tabIndex={0}
                    title="Ver detalle"
                    className={`
                      relative cursor-grab active:cursor-grabbing
                      ${draggedAssetId === asset.id ? "opacity-50" : ""}
                      ${isUpdating ? "pointer-events-none" : ""}
                    `}
                  >
                    {onStatusChange && (
                      <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10 opacity-0 hover:opacity-100 transition-opacity">
                        <GripVertical className="w-4 h-4 text-fg-subtle" />
                      </div>
                    )}
                    <AssetCard asset={asset} compact />
                    {isUpdating && draggedAssetId === asset.id && (
                      <div className="absolute inset-0 bg-surface/80 flex items-center justify-center rounded-lg">
                        <Loader2 className="w-5 h-5 animate-spin text-primary-700" />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default KanbanBoard;
