"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Plus,
  Search,
  FileText,
  Loader2,
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
import { Pagination } from "@/shared/ui/Pagination";
import {
  ESTADO_REPARTO_BADGE,
  ESTADO_REPARTO_LABEL,
  type AvanceReparto,
} from "@/modules/compras";

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
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  // Tarjeta "Por repartir" pulsada (SPEC 2.111.3): filtra la lista.
  const [soloPorRepartir, setSoloPorRepartir] = useState(false);

  useEffect(() => {
    fetchPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, sedeSeleccionada, fechaDesde, fechaHasta, page, soloPorRepartir]);

  async function fetchPurchases() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
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
      console.error("Error fetching purchases:", error);
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

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-fg-subtle" />
          </div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-fg-subtle">
            <ShoppingCart className="h-12 w-12 mb-4 text-gray-300" />
            <p>No se encontraron compras</p>
            <Can recurso="compras">
              <Link
                href="/compras/nueva"
                className="mt-4 text-primary-700 hover:text-primary-900 text-sm"
              >
                Registrar primera compra
              </Link>
            </Can>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-muted border-b">
                  <tr>
                    <th className="table-th px-4">
                      N° Factura
                    </th>
                    <th className="table-th px-4">
                      RUT Proveedor
                    </th>
                    <th className="table-th px-4">
                      Sede de llegada
                    </th>
                    <th className="table-th px-4">
                      Fecha
                    </th>
                    <th className="table-th px-4 text-center">
                      Equipos
                    </th>
                    <th className="table-th px-4">
                      OC
                    </th>
                    <th className="table-th px-4">
                      Reparto
                    </th>
                    <th className="table-th px-4 text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-surface-muted">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-fg-subtle" />
                          <span className="font-medium text-sm">{purchase.numeroFactura}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-fg-subtle">
                        {purchase.rutProveedor || "-"}
                      </td>
                      <td className="px-4 py-4 text-sm text-fg-subtle">
                        {purchase.sede?.nombre ?? "-"}
                      </td>
                      <td className="px-4 py-4 text-sm text-fg-subtle">
                        {formatearFecha(purchase.fechaFactura)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
                          purchase._count.purchaseAssets > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-fg-subtle"
                        )}>
                          {purchase._count.purchaseAssets}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-fg-subtle">
                        {purchase.ordenCompra || "-"}
                      </td>
                      <td className="px-4 py-4">
                        {purchase.reparto.estado ? (
                          <span
                            className={cn(
                              "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium",
                              ESTADO_REPARTO_BADGE[purchase.reparto.estado]
                            )}
                            title={`${purchase.reparto.pendiente} por repartir, ${purchase.reparto.repartido} repartido(s)`}
                          >
                            {ESTADO_REPARTO_LABEL[purchase.reparto.estado]}
                          </span>
                        ) : (
                          <span className="text-sm text-fg-subtle">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/compras/${purchase.id}`}
                            className="text-primary-700 hover:text-primary-900 text-sm font-medium"
                          >
                            Ver detalle
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              className="px-4 py-3 border-t border-line"
              current={page}
              pages={totalPages}
              total={total}
              limit={10}
              itemLabel="compras"
              onPageChange={setPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
