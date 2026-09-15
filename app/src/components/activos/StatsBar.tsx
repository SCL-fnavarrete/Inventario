"use client";

import {
  Package,
  CheckCircle,
  UserCheck,
  Wrench,
  RefreshCw,
  XCircle,
  DollarSign,
  Loader2
} from "lucide-react";

interface StatsData {
  total: number;
  byStatus: {
    disponible: number;
    asignado: number;
    en_mantencion: number;
    baja: number;
    vendido: number;
  };
}

interface StatsBarProps {
  data: StatsData | null;
  isLoading?: boolean;
  selectedStatus: string | null;
  onStatusClick: (status: string | null) => void;
}

const statusConfig = {
  total: {
    label: "Total",
    icon: Package,
    color: "bg-gray-100 text-gray-700 border-gray-200 hover:bg-gray-200",
    activeColor: "bg-gray-700 text-white border-gray-700",
  },
  disponible: {
    label: "Disponible",
    icon: CheckCircle,
    color: "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100",
    activeColor: "bg-emerald-600 text-white border-emerald-600",
  },
  asignado: {
    label: "Asignado",
    icon: UserCheck,
    color: "bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100",
    activeColor: "bg-blue-600 text-white border-blue-600",
  },
  en_mantencion: {
    label: "Mantenci\u00f3n",
    icon: Wrench,
    color: "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100",
    activeColor: "bg-amber-600 text-white border-amber-600",
  },
  baja: {
    label: "Baja",
    icon: XCircle,
    color: "bg-red-50 text-red-700 border-red-200 hover:bg-red-100",
    activeColor: "bg-red-600 text-white border-red-600",
  },
  vendido: {
    label: "Vendido",
    icon: DollarSign,
    color: "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200",
    activeColor: "bg-gray-600 text-white border-gray-600",
  },
};

export function StatsBar({ data, isLoading, selectedStatus, onStatusClick }: StatsBarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!data) return null;

  const statItems = [
    { key: "total", value: data.total },
    { key: "disponible", value: data.byStatus.disponible },
    { key: "asignado", value: data.byStatus.asignado },
    { key: "en_mantencion", value: data.byStatus.en_mantencion },
    { key: "baja", value: data.byStatus.baja },
    { key: "vendido", value:data.byStatus.vendido},
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {statItems.map(({ key, value }) => {
        const config = statusConfig[key as keyof typeof statusConfig];
        const Icon = config.icon;
        const isActive = key === "total"
          ? selectedStatus === null
          : selectedStatus === key;

        return (
          <button
            key={key}
            onClick={() => onStatusClick(key === "total" ? null : key)}
            className={`
              flex items-center gap-3 p-4 rounded-xl border-2
              transition-all duration-200
              ${isActive ? config.activeColor : config.color}
              focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
            `}
          >
            <div className={`
              p-2 rounded-lg
              ${isActive ? "bg-white/20" : "bg-white"}
            `}>
              <Icon className="w-5 h-5" />
            </div>
            <div className="text-left">
              <p className="text-2xl font-bold leading-none">{value}</p>
              <p className={`text-xs mt-1 ${isActive ? "text-white/80" : "text-gray-500"}`}>
                {config.label}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export default StatsBar;
