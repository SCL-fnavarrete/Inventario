"use client";

import Link from "next/link";
import {
  Clock,
  XCircle,
  AlertCircle,
  PackageX,
  Package,
  ChevronRight,
} from "lucide-react";
import { formatearFecha } from "@/lib/utils/fechas";

interface Maintenance {
  id: string;
  descripcion: string;
  fechaProgramada: Date | null;
  asset: {
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    sede: { nombre: string } | null;
  };
}

interface KitItemSinStock {
  id: string;
  nombre: string;
  categoria: "kit_bienvenida" | "epp";
  sedeNombre: string | null;
}

interface KitItemBajoStock extends KitItemSinStock {
  cantidad: number;
  stockMinimo: number;
}

interface CategoriaSinStock {
  id: string;
  nombre: string;
}

interface CategoriaBajoStock extends CategoriaSinStock {
  disponibles: number;
  stockMinimo: number;
}

interface AlertsPanelProps {
  mantencionesVencidas: Maintenance[];
  mantencionesProximas: Maintenance[];
  sinStockItems: KitItemSinStock[];
  bajoStockItems: KitItemBajoStock[];
  sinStockCategorias: CategoriaSinStock[];
  bajoStockCategorias: CategoriaBajoStock[];
}

const categoriaKitLabels: Record<KitItemSinStock["categoria"], string> = {
  kit_bienvenida: "Kit de Bienvenida",
  epp: "EPP",
};

/**
 * Etiqueta de sede para una alerta, para distinguir origen cuando estan
 * mezcladas alertas de varias sedes. `null` es un caso real (sin sede
 * asignada), no un error.
 */
function EtiquetaSede({ nombre }: { nombre: string | null }) {
  return (
    <span className="inline-block mt-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
      {nombre ?? "Sin sede"}
    </span>
  );
}

// Kit de Bienvenida y EPP viven bajo Activos; los links apuntan ahi.
const kitEppHref: Record<KitItemSinStock["categoria"], string> = {
  kit_bienvenida: "/activos/kit-bienvenida",
  epp: "/activos/epp",
};

export function AlertsPanel({
  mantencionesVencidas,
  mantencionesProximas,
  sinStockItems,
  bajoStockItems,
  sinStockCategorias,
  bajoStockCategorias,
}: AlertsPanelProps) {
  const totalAlertas =
    mantencionesVencidas.length +
    mantencionesProximas.length +
    sinStockItems.length +
    bajoStockItems.length +
    sinStockCategorias.length +
    bajoStockCategorias.length;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">
          Alertas y Notificaciones
        </h2>
        {totalAlertas > 0 && (
          <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            {totalAlertas} pendientes
          </span>
        )}
      </div>

      {totalAlertas === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <AlertCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>No hay alertas pendientes</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {/* Mantenciones Vencidas */}
          {mantencionesVencidas.map((m) => (
            <Link
              key={`venc-${m.id}`}
              href={`/mantenciones/${m.id}`}
              className="flex items-start gap-3 p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="p-2 bg-red-100 rounded-full shrink-0">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">
                  Mantención Vencida
                </p>
                <p className="text-xs text-red-700 break-words">
                  {m.asset.marca} {m.asset.modelo} ({m.asset.numeroSerie})
                </p>
                <p className="text-xs text-red-600">{m.descripcion}</p>
                <EtiquetaSede nombre={m.asset.sede?.nombre ?? null} />
              </div>
              <ChevronRight className="h-4 w-4 text-red-400 shrink-0" />
            </Link>
          ))}

          {/* Mantenciones Próximas */}
          {mantencionesProximas.map((m) => (
            <Link
              key={`prox-${m.id}`}
              href={`/mantenciones/${m.id}`}
              className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="p-2 bg-yellow-100 rounded-full shrink-0">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">
                  Mantención Próxima
                </p>
                <p className="text-xs text-yellow-700 break-words">
                  {m.asset.marca} {m.asset.modelo} ({m.asset.numeroSerie})
                </p>
                <p className="text-xs text-yellow-600">
                  {m.fechaProgramada
                    ? formatearFecha(m.fechaProgramada)
                    : "Sin fecha"}
                </p>
                <EtiquetaSede nombre={m.asset.sede?.nombre ?? null} />
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-400 shrink-0" />
            </Link>
          ))}

          {/* Sin Stock (Kit de Bienvenida / EPP) */}
          {sinStockItems.map((item) => (
            <Link
              key={`sinstock-${item.id}`}
              href={kitEppHref[item.categoria]}
              className="flex items-start gap-3 p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="p-2 bg-red-100 rounded-full shrink-0">
                <PackageX className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">Sin Stock</p>
                <p className="text-xs text-red-700 break-words">
                  {item.nombre} ({categoriaKitLabels[item.categoria]})
                </p>
                <EtiquetaSede nombre={item.sedeNombre} />
              </div>
              <ChevronRight className="h-4 w-4 text-red-400 shrink-0" />
            </Link>
          ))}

          {/* Stock Bajo (Kit de Bienvenida / EPP) */}
          {bajoStockItems.map((item) => (
            <Link
              key={`bajostock-${item.id}`}
              href={kitEppHref[item.categoria]}
              className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="p-2 bg-yellow-100 rounded-full shrink-0">
                <PackageX className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">Stock Bajo</p>
                <p className="text-xs text-yellow-700 break-words">
                  {item.nombre} ({categoriaKitLabels[item.categoria]})
                </p>
                <p className="text-xs text-yellow-600">
                  Quedan {item.cantidad} (mínimo configurado: {item.stockMinimo})
                </p>
                <EtiquetaSede nombre={item.sedeNombre} />
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-400 shrink-0" />
            </Link>
          ))}

          {/* Sin Stock (Activos disponibles por categoria) */}
          {sinStockCategorias.map((cat) => (
            <Link
              key={`sinstock-cat-${cat.id}`}
              href={`/activos?categoriaId=${cat.id}&estado=disponible`}
              className="flex items-start gap-3 p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="p-2 bg-red-100 rounded-full shrink-0">
                <Package className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">Sin Stock</p>
                <p className="text-xs text-red-700 break-words">
                  {cat.nombre}
                </p>
                {/* El stock de Activos por categoria se cuenta sumando todas
                    las sedes, a diferencia de Kit/EPP que es por sede. */}
                <EtiquetaSede nombre="Todas las sedes" />
              </div>
              <ChevronRight className="h-4 w-4 text-red-400 shrink-0" />
            </Link>
          ))}

          {/* Stock Bajo (Activos disponibles por categoria) */}
          {bajoStockCategorias.map((cat) => (
            <Link
              key={`bajostock-cat-${cat.id}`}
              href={`/activos?categoriaId=${cat.id}&estado=disponible`}
              className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="p-2 bg-yellow-100 rounded-full shrink-0">
                <Package className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">Stock Bajo</p>
                <p className="text-xs text-yellow-700 break-words">
                  {cat.nombre}
                </p>
                <p className="text-xs text-yellow-600">
                  Quedan {cat.disponibles} (mínimo configurado: {cat.stockMinimo})
                </p>
                <EtiquetaSede nombre="Todas las sedes" />
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-400 shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
