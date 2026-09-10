"use client";

import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  XCircle,
  AlertCircle,
  PackageX,
  Package,
  ChevronRight,
} from "lucide-react";

interface Maintenance {
  id: string;
  descripcion: string;
  fechaProgramada: Date | null;
  asset: {
    numeroSerie: string | null;
    marca: string;
    modelo: string;
  };
}

interface Termination {
  id: string;
  estadoNotebook: string;
  estadoCelular: string;
  estadoMonitor: string;
  fechaDesvinculacion: Date;
  employee: {
    rut: string | null;
    nombres: string;
    apellidoPaterno: string;
  };
}

interface KitItemSinStock {
  id: string;
  nombre: string;
  categoria: "kit_bienvenida" | "epp";
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
  devolucionesPendientes: Termination[];
  sinStockItems: KitItemSinStock[];
  bajoStockItems: KitItemBajoStock[];
  sinStockCategorias: CategoriaSinStock[];
  bajoStockCategorias: CategoriaBajoStock[];
}

const categoriaKitLabels: Record<KitItemSinStock["categoria"], string> = {
  kit_bienvenida: "Kit de Bienvenida",
  epp: "EPP",
};

// Antes ambas categorias vivian en /configuracion/kit-epp; se movieron a
// Activos (9-sep-2026) para que el tecnico pudiera seguir usandolas -- ver
// pendientes.md. Estos links tienen que apuntar a la ubicacion nueva.
const kitEppHref: Record<KitItemSinStock["categoria"], string> = {
  kit_bienvenida: "/activos/kit-bienvenida",
  epp: "/activos/epp",
};

export function AlertsPanel({
  mantencionesVencidas,
  mantencionesProximas,
  devolucionesPendientes,
  sinStockItems,
  bajoStockItems,
  sinStockCategorias,
  bajoStockCategorias,
}: AlertsPanelProps) {
  const totalAlertas =
    mantencionesVencidas.length +
    mantencionesProximas.length +
    devolucionesPendientes.length +
    sinStockItems.length +
    bajoStockItems.length +
    sinStockCategorias.length +
    bajoStockCategorias.length;

  return (
    <div className="bg-white rounded-lg shadow p-6">
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
              <div className="p-2 bg-red-100 rounded-full">
                <XCircle className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">
                  Mantención Vencida
                </p>
                <p className="text-xs text-red-700 truncate">
                  {m.asset.marca} {m.asset.modelo} ({m.asset.numeroSerie})
                </p>
                <p className="text-xs text-red-600">{m.descripcion}</p>
              </div>
              <ChevronRight className="h-4 w-4 text-red-400" />
            </Link>
          ))}

          {/* Mantenciones Próximas */}
          {mantencionesProximas.map((m) => (
            <Link
              key={`prox-${m.id}`}
              href={`/mantenciones/${m.id}`}
              className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="p-2 bg-yellow-100 rounded-full">
                <Clock className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">
                  Mantención Próxima
                </p>
                <p className="text-xs text-yellow-700 truncate">
                  {m.asset.marca} {m.asset.modelo} ({m.asset.numeroSerie})
                </p>
                <p className="text-xs text-yellow-600">
                  {m.fechaProgramada
                    ? new Date(m.fechaProgramada).toLocaleDateString("es-CL")
                    : "Sin fecha"}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-400" />
            </Link>
          ))}

          {/* Devoluciones Pendientes */}
          {devolucionesPendientes.map((t) => {
            const pendientes = [];
            if (t.estadoNotebook === "pendiente") pendientes.push("Notebook");
            if (t.estadoCelular === "pendiente") pendientes.push("Celular");
            if (t.estadoMonitor === "pendiente") pendientes.push("Monitor");

            return (
              <Link
                key={`dev-${t.id}`}
                href={`/desvinculaciones/${t.id}`}
                className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors"
              >
                <div className="p-2 bg-orange-100 rounded-full">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-orange-900">
                    Devolución Pendiente
                  </p>
                  <p className="text-xs text-orange-700 truncate">
                    {t.employee.nombres} {t.employee.apellidoPaterno}{t.employee.rut ? ` (${t.employee.rut})` : ""}
                  </p>
                  <p className="text-xs text-orange-600">
                    Pendiente: {pendientes.join(", ")}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-orange-400" />
              </Link>
            );
          })}

          {/* Sin Stock (Kit de Bienvenida / EPP) */}
          {sinStockItems.map((item) => (
            <Link
              key={`sinstock-${item.id}`}
              href={kitEppHref[item.categoria]}
              className="flex items-start gap-3 p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="p-2 bg-red-100 rounded-full">
                <PackageX className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">Sin Stock</p>
                <p className="text-xs text-red-700 truncate">
                  {item.nombre} ({categoriaKitLabels[item.categoria]})
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-red-400" />
            </Link>
          ))}

          {/* Stock Bajo (Kit de Bienvenida / EPP) */}
          {bajoStockItems.map((item) => (
            <Link
              key={`bajostock-${item.id}`}
              href={kitEppHref[item.categoria]}
              className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="p-2 bg-yellow-100 rounded-full">
                <PackageX className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">Stock Bajo</p>
                <p className="text-xs text-yellow-700 truncate">
                  {item.nombre} ({categoriaKitLabels[item.categoria]})
                </p>
                <p className="text-xs text-yellow-600">
                  Quedan {item.cantidad} (mínimo configurado: {item.stockMinimo})
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-400" />
            </Link>
          ))}

          {/* Sin Stock (Activos disponibles por categoria) */}
          {sinStockCategorias.map((cat) => (
            <Link
              key={`sinstock-cat-${cat.id}`}
              href={`/activos?categoriaId=${cat.id}&estado=disponible`}
              className="flex items-start gap-3 p-3 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
            >
              <div className="p-2 bg-red-100 rounded-full">
                <Package className="h-4 w-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-red-900">Sin Stock</p>
                <p className="text-xs text-red-700 truncate">
                  {cat.nombre}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-red-400" />
            </Link>
          ))}

          {/* Stock Bajo (Activos disponibles por categoria) */}
          {bajoStockCategorias.map((cat) => (
            <Link
              key={`bajostock-cat-${cat.id}`}
              href={`/activos?categoriaId=${cat.id}&estado=disponible`}
              className="flex items-start gap-3 p-3 bg-yellow-50 rounded-lg hover:bg-yellow-100 transition-colors"
            >
              <div className="p-2 bg-yellow-100 rounded-full">
                <Package className="h-4 w-4 text-yellow-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-yellow-900">Stock Bajo</p>
                <p className="text-xs text-yellow-700 truncate">
                  {cat.nombre}
                </p>
                <p className="text-xs text-yellow-600">
                  Quedan {cat.disponibles} (mínimo configurado: {cat.stockMinimo})
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-yellow-400" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
