"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  ShoppingCart,
  Plus,
  Search,
  FileText,
  Package,
  Loader2,
  ChevronLeft,
  ChevronRight,
  Calendar,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/auth/Can";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { formatearFecha } from "@/lib/utils/fechas";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, StatGrid } from "@/components/ui/StatCard";

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
};

type Stats = {
  totalCompras: number;
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

  useEffect(() => {
    fetchPurchases();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, sedeSeleccionada, fechaDesde, fechaHasta, page]);

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

      const res = await fetch(`/api/compras?${params}`);
      const data = await res.json();

      setPurchases(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
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
        description="Gestión de facturas y vinculación con activos"
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

      {/* Stats Cards */}
      <StatGrid cols={2} className="grid-cols-1 sm:grid-cols-2">
        <StatCard label="Total Facturas" value={stats?.totalCompras || 0} tone="primary" icon={FileText} />
        <StatCard
          label="Activos Vinculados"
          value={purchases.reduce((sum, p) => sum + p._count.purchaseAssets, 0)}
          tone="orange"
          icon={Package}
        />
      </StatGrid>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
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
              <Calendar size={20} className="text-gray-400" />
              <span className="text-sm text-gray-500">Desde:</span>
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => {
                  setFechaDesde(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Hasta:</span>
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => {
                  setFechaHasta(e.target.value);
                  setPage(1);
                }}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
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
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : purchases.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
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
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="table-th px-4">
                      N° Factura
                    </th>
                    <th className="table-th px-4">
                      RUT Proveedor
                    </th>
                    <th className="table-th px-4">
                      Sede
                    </th>
                    <th className="table-th px-4">
                      Fecha
                    </th>
                    <th className="table-th px-4 text-center">
                      Activos
                    </th>
                    <th className="table-th px-4">
                      OC
                    </th>
                    <th className="table-th px-4 text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {purchases.map((purchase) => (
                    <tr key={purchase.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-gray-400" />
                          <span className="font-medium text-sm">{purchase.numeroFactura}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {purchase.rutProveedor || "-"}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {purchase.sede ? purchase.sede.nombre : (
                          <span className="text-gray-400 italic">Transversal</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {formatearFecha(purchase.fechaFactura)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={cn(
                          "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium",
                          purchase._count.purchaseAssets > 0
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        )}>
                          {purchase._count.purchaseAssets}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {purchase.ordenCompra || "-"}
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

            {/* Pagination */}
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
