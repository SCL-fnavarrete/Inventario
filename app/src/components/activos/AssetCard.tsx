"use client";

import {
  User,
  Cpu,
  HardDrive,
  MemoryStick,
  Eye,
  Edit2
} from "lucide-react";
import { AssetConditionBadge, AssetStatusBadge } from "@/components/ui/Badge";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import Link from "next/link";
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

interface AssetCardProps {
  asset: AssetData;
  compact?: boolean;
}

export function AssetCard({ asset, compact = false }: AssetCardProps) {
  const hasSpecs = asset.procesador || asset.ram || asset.discoDuro;
  // El equipo se identifica unicamente por su numero de serie.
  const displayCode = asset.numeroSerie || "Sin n\u00b0 de serie";

  if (compact) {
    return (
      <div className="card p-3 transition-shadow hover:shadow-card-hover">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-gray-100 rounded-lg shrink-0">
            <CategoryIcon categoria={asset.categoria.nombre} className="w-5 h-5 text-gray-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-gray-900 break-words">
              {asset.marca} {asset.modelo}
            </p>
            <p className="text-xs text-gray-500 break-words">{displayCode}</p>
          </div>
          <div className="shrink-0">
            <AssetStatusBadge status={asset.estado} size="sm" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card overflow-hidden group transition-shadow hover:shadow-card-hover">
      {/* Header with category icon */}
      <div className="p-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl">
              <CategoryIcon categoria={asset.categoria.nombre} className="w-6 h-6 text-primary-700" />
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
              className="p-1.5 text-gray-400 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
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
            <AssetConditionBadge condicion={asset.condicion} />
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
          <div className="flex items-start gap-2 pt-2 border-t border-gray-100">
            <div className="p-1.5 bg-primary-50 rounded-full shrink-0">
              <User className="w-3.5 h-3.5 text-primary-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 break-words">
                {asset.empleadoActual.nombres} {asset.empleadoActual.apellidoPaterno}
              </p>
              {asset.empleadoActual.cargo && (
                <p className="text-xs text-gray-500 break-words">
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
