"use client";

import {
  Package,
  CheckCircle,
  UserCheck,
  Wrench,
  XCircle,
  DollarSign,
  UserX,
  Truck,
  PackageOpen,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import type { EstadoActivo } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Tilt } from "@/components/ui/Tilt";
import { ESTADO_ACTIVO_TONO, TONO_ACENTO, TONO_ESTILO, type Tono } from "@/lib/constants/tonos";

interface StatsData {
  total: number;
  /** Equipos que vienen en camino a la sede (null si no hay sede propia). */
  porLlegar: number | null;
  byStatus: {
    disponible: number;
    asignado: number;
    en_mantencion: number;
    baja: number;
    vendido: number;
    no_devuelto: number;
    en_transito: number;
    por_repartir: number;
  };
}

interface StatsBarProps {
  data: StatsData | null;
  isLoading?: boolean;
  selectedStatus: string | null;
  onStatusClick: (status: string | null) => void;
}

// Tono de cada tarjeta: el mismo del badge del estado (ESTADO_ACTIVO_TONO).
const statusConfig: Record<
  "total" | "por_llegar" | EstadoActivo,
  { label: string; icon: LucideIcon; tono: Tono }
> = {
  total: { label: "Total", icon: Package, tono: "neutral" },
  disponible: { label: "Disponible", icon: CheckCircle, tono: ESTADO_ACTIVO_TONO.disponible },
  asignado: { label: "Asignado", icon: UserCheck, tono: ESTADO_ACTIVO_TONO.asignado },
  en_mantencion: { label: "Mantención", icon: Wrench, tono: ESTADO_ACTIVO_TONO.en_mantencion },
  no_devuelto: { label: "No devuelto", icon: UserX, tono: ESTADO_ACTIVO_TONO.no_devuelto },
  en_transito: { label: "En tránsito", icon: Truck, tono: ESTADO_ACTIVO_TONO.en_transito },
  // Vienen en camino a la sede (SPEC 2.108): todavia son de la sede de origen.
  por_llegar: { label: "Por llegar", icon: PackageOpen, tono: "primary" },
  // Recien comprados, esperan su reparto (SPEC 2.111).
  por_repartir: { label: "Por repartir", icon: PackageOpen, tono: ESTADO_ACTIVO_TONO.por_repartir },
  baja: { label: "Baja", icon: XCircle, tono: ESTADO_ACTIVO_TONO.baja },
  vendido: { label: "Vendido", icon: DollarSign, tono: ESTADO_ACTIVO_TONO.vendido },
};

export function StatsBar({ data, isLoading, selectedStatus, onStatusClick }: StatsBarProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="w-6 h-6 animate-spin text-fg-subtle" />
      </div>
    );
  }

  if (!data) return null;

  const statItems = [
    { key: "total", value: data.total },
    { key: "disponible", value: data.byStatus.disponible },
    { key: "asignado", value: data.byStatus.asignado },
    { key: "en_mantencion", value: data.byStatus.en_mantencion },
    { key: "no_devuelto", value: data.byStatus.no_devuelto },
    { key: "en_transito", value: data.byStatus.en_transito },
    ...(data.porLlegar !== null ? [{ key: "por_llegar", value: data.porLlegar } as const] : []),
    { key: "baja", value: data.byStatus.baja },
    { key: "vendido", value: data.byStatus.vendido },
  ] as const;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-3 sm:grid-cols-4",
        statItems.length > 8 ? "lg:grid-cols-5 xl:grid-cols-9" : "lg:grid-cols-8"
      )}
    >
      {statItems.map(({ key, value }) => {
        const config = statusConfig[key];
        const Icon = config.icon;
        const isActive = key === "total" ? selectedStatus === null : selectedStatus === key;

        return (
          <Tilt key={key}>
            <button
              type="button"
              onClick={() => onStatusClick(key === "total" ? null : key)}
              aria-pressed={isActive}
              className={cn(
                "card-feature flex h-full w-full items-center gap-3 p-4 text-left",
                TONO_ACENTO[config.tono],
                // Seleccionada: anillo del color del estado, en vez de relleno
                // solido (que en modo oscuro quedaba como un bloque claro).
                isActive && "ring-2 ring-[var(--card-accent)] ring-offset-2 ring-offset-canvas"
              )}
            >
              <div className={cn("shrink-0 rounded-control p-2", TONO_ESTILO[config.tono].icono)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className={cn("text-2xl font-bold leading-none", TONO_ESTILO[config.tono].valor)}>
                  {value}
                </p>
                <p className="mt-1 whitespace-nowrap text-xs text-fg-subtle">{config.label}</p>
              </div>
            </button>
          </Tilt>
        );
      })}
    </div>
  );
}

export default StatsBar;
