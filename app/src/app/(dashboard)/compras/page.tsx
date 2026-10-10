"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Plus,
  Search,
  FileText,
  Calendar,
  RefreshCw,
  Split,
} from "lucide-react";
import { cn } from "@/shared/cn";
import { Can } from "@/shared/ui/Can";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { StatCard, StatGrid } from "@/shared/ui/StatCard";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import {
  ESTADO_REPARTO_BADGE,
  ESTADO_REPARTO_LABEL,
  type AvanceReparto,
} from "@/modules/compras";
import { logger } from "@/shared/logger";

type Purchase = {
  id: string;
  numeroFactura: string;
  fechaFactura: string;
  rutProveedor: string | null;
  ordenCompra: string | null;
  sede: { id: string; nombre: string; codigo: string } | null;
  _count: {
    purchaseAssets: number;
  };
  reparto: AvanceReparto;
};

type Stats = {
  totalCompras: number;
  porRepartir: number;
};

export default function ComprasPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // El input responde a cada tecla; lo que dispara la busqueda es esta
  // version debounced, para no mandar una peticion por letra.
  const debouncedSearch = useDebouncedValue(search, 350);
  // Usa el selector de sede del nav, igual que Activos, Mantenciones,
  // Solicitudes y Personal.
  const { sedeSeleccionada } = useSedeSeleccionada();
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");
  const [page, setPage] = useState(1);
  // Cuantas compras se ven por pagina ("Mostrar: N").
  const [limite, setLimite] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // Tarjeta "Por repartir" pulsada (SPEC 2.111.3): filtra la lista.
  const [soloPorRepartir, setSoloPorRepartir] = useState(false);

  useEffect(() => {
    fetchPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, sedeSeleccionada, fechaDesde, fechaHasta, page, limite, soloPorRepartir]);

  async function fetchPurchases() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: String(limite),
      });

      if (debouncedSearch) params.append("search", debouncedSearch);
      if (sedeSeleccionada) params.append("sedeId", sedeSeleccionada);
      if (fechaDesde) params.append("fechaDesde", fechaDesde);
      if (fechaHasta) params.append("fechaHasta", fechaHasta);
      if (soloPorRepartir) params.append("vista", "por_repartir");

      const res = await fetch(`/api/compras?${params}`);
      const data = await res.json();

      setPurchases(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
      setTotal(data.pagination?.total ?? 0);
      setStats(data.stats || null);
    } catch (error) {
      logger.error("Error fetching purchases", error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Compras y Facturas"
        description="Lo que se compra llega a una sede y desde ahí se reparte a las sedes"
        actions={
          <>
            <Can recurso="compras">
              <Link
                href="/compras/nueva"
                className={buttonClasses()}
              >
                <Plus size={20} />
                Nueva Compra
              </Link>
            </Can>
          </>
        }
      />

      {/* Cada tarjeta filtra la lista al pulsarla (SPEC 2.111.3). */}
      <StatGrid cols={2} className="grid-cols-1 sm:grid-cols-2">
        <StatCard
          tilt
          label="Total Facturas"
          value={stats?.totalCompras || 0}
          tone="primary"
          icon={FileText}
          activa={!soloPorRepartir}
          onClick={() => {
            setSoloPorRepartir(false);
            setPage(1);
          }}
        />
        <StatCard
          tilt
          label="Por repartir"
          hint="Compras con equipos o Kit/EPP sin repartir"
          value={stats?.porRepartir || 0}
          tone="purple"
          icon={Split}
          activa={soloPorRepartir}
          onClick={() => {
            setSoloPorRepartir(!soloPorRepartir);
            setPage(1);
          }}
        />
      </StatGrid>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-subtle" />
              <input
                type="text"
                placeholder="Buscar por N° factura, RUT proveedor, orden de compra..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="field-input pl-10 pr-4"
              />
            </div>

          </div>

          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex items-center gap-2">
              <Calendar size={20} className="text-fg-subtle" />
              <span className="text-sm text-fg-subtle">Desde:</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-fg-subtle">Hasta:</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            {/* Siempre visible; se deshabilita cuando no hay nada que
                limpiar. */}
            <button
              onClick={() => {
                setSearch("");
                setFechaDesde("");
                setFechaHasta("");
                setPage(1);
              }}
              disabled={!fechaDesde && !fechaHasta && !search}
              className={buttonClasses({ variant: "outline" })}
            >
              <RefreshCw size={16} />
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      {/* Tabla */}
      <TablaDatos
        items={purchases}
        clave={(p) => p.id}
        cargando={loading}
        compacta
        vacio={
          <div className="flex flex-col items-center">
            <ShoppingCart className="mb-4 h-12 w-12 text-gray-300" />
            <p>No se encontraron compras</p>
            <Can recurso="compras">
              <Link href="/compras/nueva" className="mt-4 text-sm text-primary-700 hover:text-primary-900">
                Registrar primera compra
              </Link>
            </Can>
          </div>
        }
        paginacion={{ current: page, pages: totalPages, total,
          limit: limite,
          itemLabel: "compras",
          onPageChange: setPage,
          onLimitChange: (n) => {
            setLimite(n);
            setPage(1);
          },
        }}
        columnas={[
          {
            titulo: "N° Factura",
            className: "px-4 py-4",
            celda: (p) => (
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-fg-subtle" />
                <span className="text-sm font-medium">{p.numeroFactura}</span>
              </div>
            ),
          },
          { titulo: "RUT Proveedor", className: "px-4 py-4 text-fg-subtle", celda: (p) => p.rutProveedor || "-" },
          { titulo: "Sede de llegada", className: "px-4 py-4 text-fg-subtle", celda: (p) => p.sede?.nombre ?? "-" },
          { titulo: "Fecha", className: "px-4 py-4 text-fg-subtle", celda: (p) => formatearFecha(p.fechaFactura) },
          {
            titulo: "Equipos",
            className: "px-4 py-4 text-center",
            celda: (p) => (
              <span
                className={cn(
                  "inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium",
                  p._count.purchaseAssets > 0 ? "bg-green-100 text-green-700" : "bg-gray-100 text-fg-subtle"
                )}
              >
                {p._count.purchaseAssets}
              </span>
            ),
          },
          { titulo: "OC", className: "px-4 py-4 text-fg-subtle", celda: (p) => p.ordenCompra || "-" },
          {
            titulo: "Reparto",
            className: "px-4 py-4",
            celda: (p) =>
              p.reparto.estado ? (
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                    ESTADO_REPARTO_BADGE[p.reparto.estado]
                  )}
                  title={`${p.reparto.pendiente} por repartir, ${p.reparto.repartido} repartido(s)`}
                >
                  {ESTADO_REPARTO_LABEL[p.reparto.estado]}
                </span>
              ) : (
                <span className="text-sm text-fg-subtle">-</span>
              ),
          },
        ]}
        acciones={(p) => (
          <Link href={`/compras/${p.id}`} className="text-sm font-medium text-primary-700 hover:text-primary-900">
            Ver detalle
          </Link>
        )}
      />
    </div>
  );
}
