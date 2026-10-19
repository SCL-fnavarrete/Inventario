"use client";

import Link from "next/link";
import {
  Clock,
  XCircle,
  AlertCircle,
  PackageX,
  Package,
  ChevronRight,
  MapPinOff,
  ShieldCheck,
} from "lucide-react";
import { formatearFecha, formatearFechaConHora } from "@/shared/utilidades/fechas";
import { identificadorActivo } from "@/modules/activos";

interface Maintenance {
  id: string;
  descripcion: string;
  fechaProgramada: Date | null;
  horaProgramada: string | null;
  asset: {
    numeroSerie: string | null;
    imei?: string | null;
    marca: { nombre: string };
    modelo: string;
    sede: { nombre: string } | null;
  };
}

interface GarantiaPorVencer {
  id: string;
  marca: { nombre: string };
  modelo: string;
  numeroSerie: string | null;
  imei?: string | null;
  fechaGarantiaFin: Date | null;
  diasRestantes: number;
  sede: { nombre: string } | null;
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
  // Solo las mas urgentes de cada grupo; los totales cuentan todas (SPEC 2.125).
  mantencionesVencidas: Maintenance[];
  mantencionesProximas: Maintenance[];
  totalVencidas: number;
  totalProximas: number;
  sinStockItems: KitItemSinStock[];
  bajoStockItems: KitItemBajoStock[];
  sinStockCategorias: CategoriaSinStock[];
  bajoStockCategorias: CategoriaBajoStock[];
  /** Equipos sin sede (importados sin ella, SPEC 2.117): se completan en Editar. */
  equiposSinSede: number;
  /** Aviso informativo (no cuenta como alerta): garantias que vencen pronto. */
  garantiasPorVencer: GarantiaPorVencer[];
  totalGarantiasPorVencer: number;
}

const categoriaKitLabels: Record<KitItemSinStock["categoria"], string> = {
  kit_bienvenida: "Kit de Bienvenida",
  epp: "EPP",
};

/** "…y 995 vencidas más · Ver todas": lleva a Mantenciones ya filtrada. */
function VerMas({ resto, texto, vista }: { resto: number; texto: string; vista: "vencidas" | "proximas" }) {
  if (resto <= 0) return null;
  return (
    <Link
      href={`/mantenciones?vista=${vista}`}
      className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm text-fg-muted hover:bg-surface-muted"
    >
      <span>
        …y {resto.toLocaleString("es-CL")} {texto} más
      </span>
      <span className="flex items-center gap-1 font-medium text-primary-700">
        Ver todas <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

/**
 * Etiqueta de sede para una alerta, para distinguir origen cuando estan
 * mezcladas alertas de varias sedes. `null` es un caso real (sin sede
 * asignada), no un error.
 */
function EtiquetaSede({ nombre }: { nombre: string | null }) {
  return (
    <span className="inline-block mt-0.5 text-[10px] font-medium uppercase tracking-wide text-fg-muted bg-gray-100 rounded px-1.5 py-0.5">
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
  totalVencidas,
  totalProximas,
  sinStockItems,
  bajoStockItems,
  sinStockCategorias,
  bajoStockCategorias,
  equiposSinSede,
  garantiasPorVencer,
  totalGarantiasPorVencer,
}: AlertsPanelProps) {
  const totalAlertas =
    (equiposSinSede > 0 ? 1 : 0) +
    totalVencidas +
    totalProximas +
    sinStockItems.length +
    bajoStockItems.length +
    sinStockCategorias.length +
    bajoStockCategorias.length;

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-fg">
          Alertas y Notificaciones
        </h2>
        {totalAlertas > 0 && (
          <span className="bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full">
            {totalAlertas.toLocaleString("es-CL")} {totalAlertas === 1 ? "alerta" : "alertas"}
          </span>
        )}
      </div>

      {totalAlertas === 0 && totalGarantiasPorVencer === 0 ? (
        <div className="text-center py-8 text-fg-subtle">
          <AlertCircle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
          <p>No hay alertas pendientes</p>
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {/* Equipos sin sede: abre Activos con el filtro "Sin sede" (SPEC 2.117) */}
          {equiposSinSede > 0 && (
            <Link
              href="/activos?sede=sin_dato"
              className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <div className="p-2 bg-blue-100 rounded-full shrink-0">
                <MapPinOff className="h-4 w-4 text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-blue-900">
                  {equiposSinSede.toLocaleString("es-CL")} {equiposSinSede === 1 ? "equipo sin sede" : "equipos sin sede"}
                </p>
                <p className="text-xs text-blue-700">Asígnales la sede desde Editar equipo.</p>
              </div>
              <ChevronRight className="h-4 w-4 text-blue-400 shrink-0" />
            </Link>
          )}

          {/* Garantias por vencer: solo informativo, por eso va en morado y no suma a las alertas */}
          {garantiasPorVencer.map((a) => (
            <Link
              key={`garantia-${a.id}`}
              href={`/activos/${a.id}`}
              className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
            >
              <div className="p-2 bg-purple-100 rounded-full shrink-0">
                <ShieldCheck className="h-4 w-4 text-purple-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-purple-900">Garantía por vencer</p>
                <p className="text-xs text-purple-700 break-words">
                  {a.marca.nombre} {a.modelo} ({identificadorActivo(a)})
                </p>
                <p className="text-xs text-purple-800">
                  {a.diasRestantes === 0
                    ? "Vence hoy"
                    : `Vence en ${a.diasRestantes} ${a.diasRestantes === 1 ? "día" : "días"}`}
                  {a.fechaGarantiaFin ? ` (${formatearFecha(a.fechaGarantiaFin)})` : ""}
                </p>
                <EtiquetaSede nombre={a.sede?.nombre ?? null} />
              </div>
              <ChevronRight className="h-4 w-4 text-purple-400 shrink-0" />
            </Link>
          ))}
          {totalGarantiasPorVencer > garantiasPorVencer.length && (
            <p className="px-3 text-sm text-fg-muted">
              …y {(totalGarantiasPorVencer - garantiasPorVencer.length).toLocaleString("es-CL")} garantías más por vencer
            </p>
          )}

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
                  {m.asset.marca.nombre} {m.asset.modelo} ({identificadorActivo(m.asset)})
                </p>
                <p className="text-xs text-red-700">{m.descripcion}</p>
                <EtiquetaSede nombre={m.asset.sede?.nombre ?? null} />
              </div>
              <ChevronRight className="h-4 w-4 text-red-400 shrink-0" />
            </Link>
          ))}
          <VerMas resto={totalVencidas - mantencionesVencidas.length} texto="vencidas" vista="vencidas" />

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
                  {m.asset.marca.nombre} {m.asset.modelo} ({identificadorActivo(m.asset)})
                </p>
                <p className="text-xs text-yellow-800">
                  {m.fechaProgramada
                    ? formatearFechaConHora(m.fechaProgramada, m.horaProgramada)
                    : "Sin fecha"}
                </p>
                <EtiquetaSede nombre={m.asset.sede?.nombre ?? null} />
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-400 shrink-0" />
            </Link>
          ))}
          <VerMas resto={totalProximas - mantencionesProximas.length} texto="próximas" vista="proximas" />

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
                <p className="text-xs text-yellow-800">
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
                <p className="text-xs text-yellow-800">
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
