"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search, Filter, RefreshCw } from "lucide-react";
import { GuiaDespachoTable } from "@/components/guias-despacho/GuiaDespachoTable";
import { ESTADO_GUIA_LABELS, type DispatchGuideListItem } from "@/types/guia-despacho";
import { EstadoGuia } from "@prisma/client";
import { Can } from "@/components/auth/Can";

export default function GuiasDespachoPage() {
  const [guides, setGuides] = useState<DispatchGuideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchGuides();
  }, [page, estadoFilter]);

  async function fetchGuides() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
      });

      if (estadoFilter !== "all") {
        params.append("estado", estadoFilter);
      }

      if (searchTerm) {
        params.append("busqueda", searchTerm);
      }

      const res = await fetch(`/api/guias-despacho?${params}`);
      const data = await res.json();

      setGuides(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error("Error fetching guides:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchGuides();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Guías de Despacho</h1>
          <p className="text-gray-600">Gestiona el despacho de equipos</p>
        </div>
        <Can recurso="guias">
          <Link
            href="/guias-despacho/nueva"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            Nueva Guía
          </Link>
        </Can>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Buscar por número, destinatario, origen o destino..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={estadoFilter}
              onChange={(e) => {
                setEstadoFilter(e.target.value);
                setPage(1);
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todos los estados</option>
              {Object.entries(ESTADO_GUIA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Filter size={20} />
            </button>
            <button
              type="button"
              onClick={() => {
                setSearchTerm("");
                setEstadoFilter("all");
                setPage(1);
                fetchGuides();
              }}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              title="Limpiar filtros"
            >
              <RefreshCw size={20} />
            </button>
          </div>
        </form>
      </div>

      {/* Tabla */}
      <GuiaDespachoTable guides={guides} loading={loading} />

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Anterior
          </button>
          <span className="px-4 py-2 text-gray-600">
            Página {page} de {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Siguiente
          </button>
        </div>
      )}
    </div>
  );
}
