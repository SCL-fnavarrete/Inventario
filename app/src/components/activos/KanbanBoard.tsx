"use client";

import { useState, useCallback } from "react";
import {
  CheckCircle,
  UserCheck,
  Wrench,
  RefreshCw,
  XCircle,
  Loader2,
  GripVertical
} from "lucide-react";
import { AssetCard } from "./AssetCard";

interface AssetData {
  id: string;
  numeroSerie: string | null;
  numeroActivoInterno: string | null;
  marca: string;
  modelo: string;
  estado: "disponible" | "asignado" | "en_mantencion" | "reutilizable" | "baja" | "vendido";
  condicion: "nuevo" | "usado" | "danado";
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
    correo?: string | null;
    cargo?: string | null;
  } | null;
}

interface KanbanBoardProps {
  assets: AssetData[];
  onStatusChange?: (assetId: string, newStatus: string) => Promise<void>;
  isUpdating?: boolean;
}

type StatusType = "disponible" | "asignado" | "en_mantencion" | "reutilizable" | "baja";

const columns: {
  id: StatusType;
  label: string;
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
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-200",
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
    id: "reutilizable",
    label: "Reutilizable",
    icon: RefreshCw,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-200",
  },
  {
    id: "baja",
    label: "Baja",
    icon: XCircle,
    color: "text-red-600",
    bgColor: "bg-red-50",
    borderColor: "border-red-200",
  },
];

export function KanbanBoard({ assets, onStatusChange, isUpdating }: KanbanBoardProps) {
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
    { disponible: [], asignado: [], en_mantencion: [], reutilizable: [], baja: [] }
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
              ${isDragOver ? `${column.borderColor} ${column.bgColor}` : "border-gray-200 bg-gray-50"}
            `}
            onDragOver={(e) => handleDragOver(e, column.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, column.id)}
          >
            {/* Column Header */}
            <div className={`
              p-3 border-b-2 rounded-t-lg
              ${isDragOver ? column.borderColor : "border-gray-200"}
              ${isDragOver ? column.bgColor : "bg-white"}
            `}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon className={`w-5 h-5 ${column.color}`} />
                  <span className="font-semibold text-gray-900">{column.label}</span>
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
                  p-8 text-center text-gray-400 border-2 border-dashed rounded-lg
                  ${isDragOver ? column.borderColor : "border-gray-200"}
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
                    className={`
                      relative cursor-grab active:cursor-grabbing
                      ${draggedAssetId === asset.id ? "opacity-50" : ""}
                      ${isUpdating ? "pointer-events-none" : ""}
                    `}
                  >
                    {onStatusChange && (
                      <div className="absolute left-1 top-1/2 -translate-y-1/2 z-10 opacity-0 hover:opacity-100 transition-opacity">
                        <GripVertical className="w-4 h-4 text-gray-400" />
                      </div>
                    )}
                    <AssetCard asset={asset} compact />
                    {isUpdating && draggedAssetId === asset.id && (
                      <div className="absolute inset-0 bg-white/80 flex items-center justify-center rounded-lg">
                        <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
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
