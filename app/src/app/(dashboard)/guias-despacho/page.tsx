"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { GuiaDespachoTable } from "@/components/guias-despacho/GuiaDespachoTable";
import { ESTADO_GUIA_LABELS, type DispatchGuideListItem } from "@/types/guia-despacho";
import { EstadoGuia } from "@prisma/client";
import { Can } from "@/components/auth/Can";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";

export default function GuiasDespachoPage() {
  const [guides, setGuides] = useState<DispatchGuideListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // El input responde a cada tecla; lo que dispara la busqueda es esta
  // version debounced -- antes exigia enviar el formulario (Enter). Ver
  // useDebouncedValue y SPEC 2.14.
  const debouncedSearchTerm = useDebouncedValue(searchTerm, 350);
  const [estadoFilter, setEstadoFilter] = useState<string>("all");
  // Selector de sede del nav (18-sep-2026, SPEC 2.9.8): filtra por las dos
  // puntas de la guia, origen y destino -- ver la nota en la API.
  const { sedeSeleccionada } = useSedeSeleccionada();
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    fetchGuides();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, estadoFilter, debouncedSearchTerm, sedeSeleccionada]);

  // `searchOverride` es para el Enter explicito (handleSearch) y para
  // "Limpiar filtros": sin el, buscarian con el valor debounced anterior en
  // vez de con lo que el usuario realmente quiere en ese momento.
  async function fetchGuides(searchOverride?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
      });

      if (estadoFilter !== "all") {
        params.append("estado", estadoFilter);
      }

      if (sedeSeleccionada) {
        params.append("sedeId", sedeSeleccionada);
      }

      const terminoBusqueda = searchOverride ?? debouncedSearchTerm;
      if (terminoBusqueda) {
        params.append("busqueda", terminoBusqueda);
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

  // El formulario ya no es necesario para que la busqueda se aplique (eso
  // ahora lo hace el debounce), pero se deja: Enter sigue funcionando y
  // fuerza la busqueda de inmediato con lo escrito en el momento.
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchGuides(searchTerm);
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
              placeholder="Buscar por número, OT Chilexpress o receptor..."
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
