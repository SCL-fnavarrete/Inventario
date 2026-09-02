"use client";

import {
  Laptop,
  Smartphone,
  Monitor,
  Mouse,
  Headphones,
  Printer,
  Package,
  User,
  Cpu,
  HardDrive,
  MemoryStick,
  Eye,
  Edit2
} from "lucide-react";
import { createElement } from "react";
import { Badge, AssetStatusBadge } from "@/components/ui/Badge";
import Link from "next/link";
import type { EstadoActivo, CondicionActivo } from "@prisma/client";

interface AssetData {
  id: string;
  numeroSerie: string | null;
  numeroActivoInterno: string | null;
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
    correo?: string | null;
    cargo?: string | null;
  } | null;
}

interface AssetCardProps {
  asset: AssetData;
  compact?: boolean;
}

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  notebook: Laptop,
  laptop: Laptop,
  celular: Smartphone,
  telefono: Smartphone,
  smartphone: Smartphone,
  monitor: Monitor,
  mouse: Mouse,
  audifonos: Headphones,
  audifono: Headphones,
  impresora: Printer,
  printer: Printer,
};

function getCategoryIcon(categoryName: string): React.ComponentType<{ className?: string }> {
  const lowerName = categoryName.toLowerCase();
  for (const [key, icon] of Object.entries(categoryIcons)) {
    if (lowerName.includes(key)) {
      return icon;
    }
  }
  return Package;
}

/**
 * Envuelve la seleccion del icono de categoria. El icono sale siempre de
 * `categoryIcons`, un mapa de modulo, asi que la referencia es estable entre
 * renders; envolverlo aqui se lo hace explicito al compilador de React.
 */
function CategoryIcon({ categoria, className }: { categoria: string; className?: string }) {
  return createElement(getCategoryIcon(categoria), { className });
}

// Valores del enum CondicionActivo: nuevo | usado | danado.
const conditionColors: Record<CondicionActivo, string> = {
  nuevo: "bg-emerald-100 text-emerald-700",
  usado: "bg-blue-100 text-blue-700",
  danado: "bg-red-100 text-red-700",
};

const conditionLabels: Record<CondicionActivo, string> = {
  nuevo: "Nuevo",
  usado: "Usado",
  danado: "Dañado",
};

export function AssetCard({ asset, compact = false }: AssetCardProps) {
  const hasSpecs = asset.procesador || asset.ram || asset.discoDuro;
  const displayCode = asset.numeroActivoInterno || asset.numeroSerie || "Sin c\u00f3digo";

  if (compact) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-shadow">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-gray-100 rounded-lg">
            <CategoryIcon categoria={asset.categoria.nombre} className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900 truncate">
              {asset.marca} {asset.modelo}
            </p>
            <p className="text-xs text-gray-500 truncate">{displayCode}</p>
          </div>
          <AssetStatusBadge status={asset.estado} size="sm" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 overflow-hidden group">
      {/* Header with category icon */}
      <div className="p-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl">
              <CategoryIcon categoria={asset.categoria.nombre} className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">
                {asset.marca} {asset.modelo}
              </p>
              <p className="text-sm text-gray-500">{asset.categoria.nombre}</p>
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Link
              href={`/activos/${asset.id}`}
              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Ver detalle"
            >
              <Eye className="w-4 h-4" />
            </Link>
            <Link
              href={`/activos/${asset.id}/editar`}
              className="p-1.5 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
              title="Editar"
            >
              <Edit2 className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Code */}
        <div className="flex items-center justify-between">
          <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded text-gray-700">
            {displayCode}
          </span>
          <div className="flex gap-1.5">
            <AssetStatusBadge status={asset.estado} size="sm" />
            <span className={`
              px-2 py-0.5 rounded-full text-xs font-medium
              ${conditionColors[asset.condicion]}
            `}>
              {conditionLabels[asset.condicion]}
            </span>
          </div>
        </div>

        {/* Specs (if available) */}
        {hasSpecs && (
          <div className="flex flex-wrap gap-2 text-xs text-gray-600">
            {asset.procesador && (
              <span className="inline-flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
                <Cpu className="w-3 h-3" />
                {asset.procesador}
              </span>
            )}
            {asset.ram && (
              <span className="inline-flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
                <MemoryStick className="w-3 h-3" />
                {asset.ram}
              </span>
            )}
            {asset.discoDuro && (
              <span className="inline-flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
                <HardDrive className="w-3 h-3" />
                {asset.discoDuro}
              </span>
            )}
          </div>
        )}

        {/* Assigned user */}
        {asset.empleadoActual && (
          <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
            <div className="p-1.5 bg-blue-50 rounded-full">
              <User className="w-3.5 h-3.5 text-blue-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {asset.empleadoActual.nombres} {asset.empleadoActual.apellidoPaterno}
              </p>
              {asset.empleadoActual.cargo && (
                <p className="text-xs text-gray-500 truncate">
                  {asset.empleadoActual.cargo}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AssetCard;
