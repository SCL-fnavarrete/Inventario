"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Upload,
  Download,
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  ChevronDown,
  ChevronUp,
  Columns3,
  LayoutGrid,
  LayoutList,
  Kanban,
  Cpu,
  HardDrive,
  Calendar,
  MapPin,
  Shield,
  User,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { StatsBar, CategoryTabs, ActiveFilters, AssetCard, KanbanBoard } from "@/components/activos";
import { Can } from "@/components/auth/Can";
import { Modal } from "@/components/ui/Modal";
import { BajaActivoForm } from "@/components/activos/BajaActivoForm";
import { ReasignarActivoForm } from "@/components/activos/ReasignarActivoForm";

type Asset = {
  id: string;
  numeroActivoInterno: string | null;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: "disponible" | "asignado" | "en_mantencion" | "reutilizable" | "baja";
  condicion: "nuevo" | "bueno" | "regular" | "malo";
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  microsoft365: boolean;
  intuneEnrolled: boolean;
  fechaCompra: Date | null;
  fechaGarantiaFin: Date | null;
  ubicacionFisica: string | null;
  imei: string | null;
  numeroTelefono: string | null;
  categoria: {
    id: string;
    nombre: string;
  };
  empleadoActual: {
    id: string;
    nombres: string;
    apellidoPaterno: string;
    correo: string;
    cargo: string | null;
  } | null;
};

type StatsData = {
  total: number;
  byStatus: {
    disponible: number;
    asignado: number;
    en_mantencion: number;
    reutilizable: number;
    baja: number;
    vendido: number;
  };
  byCategory: Array<{ id: string; nombre: string; count: number }>;
  byCondition: Record<string, number>;
};

type ColumnConfig = {
  id: string;
  label: string;
  visible: boolean;
  required?: boolean;
};

type Pagination = {
  total: number;
  pages: number;
  current: number;
  limit: number;
};

const estadoColors: Record<string, string> = {
  disponible: "bg-green-100 text-green-800",
  asignado: "bg-blue-100 text-blue-800",
  en_mantencion: "bg-yellow-100 text-yellow-800",
  reutilizable: "bg-purple-100 text-purple-800",
  baja: "bg-red-100 text-red-800",
  vendido: "bg-gray-100 text-gray-800",
};

const estadoLabels: Record<string, string> = {
  disponible: "Disponible",
  asignado: "Asignado",
  en_mantencion: "En Mantenci\u00f3n",
  reutilizable: "Reutilizable",
  baja: "Baja",
  vendido: "Vendido",
};

const condicionColors: Record<string, string> = {
  nuevo: "bg-emerald-50 text-emerald-700",
  bueno: "bg-blue-50 text-blue-700",
  regular: "bg-amber-50 text-amber-700",
  malo: "bg-red-50 text-red-700",
};

const condicionLabels: Record<string, string> = {
  nuevo: "Nuevo",
  bueno: "Bueno",
  regular: "Regular",
  malo: "Malo",
};

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-5 w-5" />;
    case "celular":
      return <Smartphone className="h-5 w-5" />;
    case "monitor":
      return <Monitor className="h-5 w-5" />;
    default:
      return <Package className="h-5 w-5" />;
  }
}

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "tipo", label: "Tipo", visible: true, required: true },
  { id: "identificacion", label: "C\u00f3digo/Serie", visible: true, required: true },
  { id: "marca", label: "Marca/Modelo", visible: true, required: true },
  { id: "estado", label: "Estado", visible: true, required: true },
  { id: "condicion", label: "Condici\u00f3n", visible: true },
  { id: "asignado", label: "Asignado a", visible: true },
  { id: "specs", label: "Especificaciones", visible: true },
  { id: "fechaCompra", label: "Fecha Compra", visible: false },
  { id: "ubicacion", label: "Ubicaci\u00f3n", visible: false },
  { id: "software", label: "Software", visible: false },
  { id: "acciones", label: "Acciones", visible: true, required: true },
];

function ActivosPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // URL state
  const estadoFilter = searchParams.get("estado") || "";
  const categoriaFilter = searchParams.get("categoriaId") || "";
  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1");
  const limitParam = parseInt(searchParams.get("limit") || "10");

  // Local state
  const [assets, setAssets] = useState<Asset[]>([]);
  const [allAssets, setAllAssets] = useState<Asset[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    total: 0,
    pages: 0,
    current: currentPage,
    limit: limitParam,
  });
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [searchInput, setSearchInput] = useState(searchQuery);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"table" | "cards" | "kanban">("table");
  const [columns, setColumns] = useState<ColumnConfig[]>(DEFAULT_COLUMNS);
  const [bajaModalAssetId, setBajaModalAssetId] = useState<string | null>(null);
  const [reasignarModalAssetId, setReasignarModalAssetId] = useState<string | null>(null);
  const [showColumnSelector, setShowColumnSelector] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  // Update URL params
  const updateUrlParams = useCallback((updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    Object.entries(updates).forEach(([key, value]) => {
      if (value === null || value === "") {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });

    // Reset page when filters change
    if (!("page" in updates)) {
      params.set("page", "1");
    }

    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }, [router, pathname, searchParams]);

  // Fetch stats
  useEffect(() => {
    async function fetchStats() {
      setStatsLoading(true);
      try {
        const res = await fetch("/api/activos/stats");
        const data = await res.json();
        setStats(data);
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, []);

  // Fetch assets
  useEffect(() => {
    async function fetchAssets() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: limitParam.toString(),
        });
        if (searchQuery) params.append("search", searchQuery);
        if (estadoFilter) params.append("estado", estadoFilter);
        if (categoriaFilter) params.append("categoriaId", categoriaFilter);

        const res = await fetch(`/api/activos?${params}`);
        const data = await res.json();
        setAssets(data.data);
        setPagination(data.pagination);
      } catch (error) {
        console.error("Error fetching assets:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchAssets();
  }, [currentPage, limitParam, searchQuery, estadoFilter, categoriaFilter]);

  // Fetch all assets for Kanban view
  useEffect(() => {
    if (viewMode === "kanban") {
      async function fetchAllAssets() {
        try {
          const params = new URLSearchParams({ limit: "1000" });
          if (searchQuery) params.append("search", searchQuery);
          if (categoriaFilter) params.append("categoriaId", categoriaFilter);

          const res = await fetch(`/api/activos?${params}`);
          const data = await res.json();
          setAllAssets(data.data);
        } catch (error) {
          console.error("Error fetching all assets:", error);
        }
      }
      fetchAllAssets();
    }
  }, [viewMode, searchQuery, categoriaFilter]);

  // Handle search submit
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    updateUrlParams({ search: searchInput || null });
  }

  // Handle status filter from StatsBar
  function handleStatusClick(status: string | null) {
    updateUrlParams({ estado: status });
  }

  // Handle category filter from CategoryTabs
  function handleCategoryClick(categoryId: string | null) {
    updateUrlParams({ categoriaId: categoryId });
  }

  // Handle filter removal
  function handleRemoveFilter(key: string) {
    if (key === "search") {
      setSearchInput("");
    }
    updateUrlParams({ [key === "categoriaId" ? "categoriaId" : key]: null });
  }

  // Clear all filters
  function handleClearAllFilters() {
    setSearchInput("");
    router.push(pathname, { scroll: false });
  }

  /*
  // Handle status change from Kanban drag-and-drop
  async function handleStatusChange(assetId: string, newStatus: string) {
    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/activos/${assetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado: newStatus }),
      });

      if (res.ok) {
        // Update local state
        setAllAssets((prev) =>
          prev.map((a) =>
            a.id === assetId ? { ...a, estado: newStatus as Asset["estado"] } : a
          )
        );
        // Refresh stats
        const statsRes = await fetch("/api/activos/stats");
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      console.error("Error updating status:", error);
    } finally {
      setIsUpdatingStatus(false);
    }
  }
  */

  async function handleStatusChange(assetId: string, newStatus: string){
    const asset = allAssets.find((a) => a.id == assetId);
    if (!asset) return;
    const currentStatus = asset.estado;

    //No necesita pantalla intermedia, no hace falta ningun dato extra
    if (currentStatus == "reutilizable" && newStatus == "disponible"){
      setIsUpdatingStatus(true);
      try{
        const res = await fetch(`/api/activos/${assetId}`,{
          method : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ estado: newStatus }),
        });

        if (res.ok) {
          setAllAssets((prev)=>
          prev.map((a)=>
          a.id===assetId ? { ...a, estado:newStatus as Asset["estado"]} : a
        )
      );
      const statsRes = await fetch("/api/activos/stats");
      const statsData = await statsRes.json();
      setStats(statsData);
      } else{
        const data = await res.json().catch(() => null);
        alert(data?.error ?? "No se pudo actualizar el estado del activo");
      }
    } catch (error){
      console.error("Error updating status:", error);
      alert("Error de conexión al actualizar el activo");
    } finally {
      setIsUpdatingStatus(false);
    }
    return;
  }

  //asignacion nueva: no hay formulario directo, pasa por solicitudes
  if (currentStatus === "disponible" && newStatus ==="asignado"){
    router.push("/solicitudes/nueva");
    return;
  }

  //enviar a mantencion: necesita tipo:motivo/fecha
  if ((currentStatus === "disponible" || currentStatus === "asignado") &&newStatus === "en_mantencion"){
    router.push(`/mantenciones/programar?activoId=${assetId}`);
    return;
  }

  //Devolucion de un equipo asignado (a reutilizable o dado de baja)
  if (currentStatus==="asignado" && (newStatus ==="reutilizable" || newStatus==="baja")){
    try{
      const res = await fetch(`/api/asignaciones?assetId=${assetId}&activo=true&limit=1`);
      const data = await res.json();
      const asignacionId = data?.data?.[0]?.id;
      if (asignacionId){
        router.push(`/asignaciones/devolucion?id=${asignacionId}`);
      }else{
        alert("No se encontro la asignacion activa de este equipo");
      }
    }catch(error){
      console.error("Error buscando la asignacion:",error);
      alert("Error al buscar la asignacion del equipo");
    }
    return;
  }

  //reasignar un equipo reutilizable a otro empleado:por formulario directo
  if (currentStatus === "reutilizable" && newStatus === "asignado"){
    router.push("/solicitudes/nueva");
    return;
  }

  //dar de baja: se necesita un motivo
  if (newStatus === "baja" && (currentStatus === "reutilizable" || currentStatus === "en_mantencion" || currentStatus === "disponible")) {
    setBajaModalAssetId(assetId);
    return;
  }

  //vender un activo dado de baja: necesita comprador, monto y fecha
  if(currentStatus === "baja" && newStatus==="vendido"){
    router.push(`/activos/${assetId}/venta`);
    return;
  }

  //salir de mantencion: no hay forma de preseleccionar la mantencion desde aca
  if(currentStatus=== "en_mantencion"){
    router.push("/mantenciones");
    return;
  }

  //Cualquier otra combinacion no tiene un camino definido todavia
  alert(`No se puede pasar de "${currentStatus}" a "${newStatus}" desde el Kanban`);
}


  function toggleRowExpansion(assetId: string) {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(assetId)) {
        newSet.delete(assetId);
      } else {
        newSet.add(assetId);
      }
      return newSet;
    });
  }

  function toggleColumnVisibility(columnId: string) {
    setColumns((prev) =>
      prev.map((col) =>
        col.id === columnId && !col.required
          ? { ...col, visible: !col.visible }
          : col
      )
    );
  }

  // Build active filters for display
  const activeFilters = [];
  if (searchQuery) {
    activeFilters.push({
      key: "search",
      label: "B\u00fasqueda",
      value: searchQuery,
      displayValue: `"${searchQuery}"`,
    });
  }
  if (estadoFilter) {
    activeFilters.push({
      key: "estado",
      label: "Estado",
      value: estadoFilter,
      displayValue: estadoLabels[estadoFilter] || estadoFilter,
    });
  }
  if (categoriaFilter && stats?.byCategory) {
    const category = stats.byCategory.find((c) => c.id === categoriaFilter);
    activeFilters.push({
      key: "categoriaId",
      label: "Categor\u00eda",
      value: categoriaFilter,
      displayValue: category?.nombre || categoriaFilter,
    });
  }

  const visibleColumns = columns.filter((col) => col.visible);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Activos {stats && <span className="text-gray-500">({stats.total})</span>}
          </h1>
          <p className="text-gray-600">Gesti\u00f3n de equipos y dispositivos IT</p>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/activos/exportar?estado=${estadoFilter}&categoriaId=${categoriaFilter}`}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Download size={20} />
            <span className="hidden sm:inline">Exportar</span>
          </a>
          <Can recurso="activos">
            <Link
              href="/activos/importar"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload size={20} />
              <span className="hidden sm:inline">Importar</span>
            </Link>
            <Link
              href="/activos/nuevo"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>Nuevo</span>
            </Link>
          </Can>
        </div>
      </div>

      {/* Stats Bar */}
      <StatsBar
        data={stats}
        isLoading={statsLoading}
        selectedStatus={estadoFilter || null}
        onStatusClick={handleStatusClick}
      />

      {/* Category Tabs */}
      {stats && (
        <CategoryTabs
          categories={stats.byCategory}
          selectedCategory={categoriaFilter || null}
          onCategoryClick={handleCategoryClick}
          isLoading={statsLoading}
        />
      )}

      {/* Search, Filters and View Controls */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por serie, marca, modelo..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </form>
        </div>

        {/* Active Filters */}
        {activeFilters.length > 0 && (
          <ActiveFilters
            filters={activeFilters}
            onRemoveFilter={handleRemoveFilter}
            onClearAll={handleClearAllFilters}
          />
        )}

        {/* View Mode and Column Selector */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600">Vista:</span>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setViewMode("table")}
                className={cn(
                  "p-2 rounded transition-colors",
                  viewMode === "table"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
                title="Vista de tabla"
              >
                <LayoutList size={18} />
              </button>
              <button
                onClick={() => setViewMode("cards")}
                className={cn(
                  "p-2 rounded transition-colors",
                  viewMode === "cards"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
                title="Vista de tarjetas"
              >
                <LayoutGrid size={18} />
              </button>
              <button
                onClick={() => setViewMode("kanban")}
                className={cn(
                  "p-2 rounded transition-colors",
                  viewMode === "kanban"
                    ? "bg-white text-blue-600 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                )}
                title="Vista Kanban"
              >
                <Kanban size={18} />
              </button>
            </div>
          </div>

          {viewMode === "table" && (
            <div className="relative">
              <button
                onClick={() => setShowColumnSelector(!showColumnSelector)}
                className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Columns3 size={16} />
                <span>Columnas</span>
                <ChevronDown size={16} />
              </button>

              {showColumnSelector && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border z-10">
                  <div className="p-2">
                    <p className="text-xs font-medium text-gray-500 uppercase px-2 py-1">
                      Mostrar columnas
                    </p>
                    {columns.map((col) => (
                      <label
                        key={col.id}
                        className={cn(
                          "flex items-center gap-2 px-2 py-2 rounded hover:bg-gray-50 cursor-pointer",
                          col.required && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={col.visible}
                          onChange={() => toggleColumnVisibility(col.id)}
                          disabled={col.required}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">{col.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      {viewMode === "kanban" ? (
        <KanbanBoard
          assets={allAssets}
          onStatusChange={handleStatusChange}
          isUpdating={isUpdatingStatus}
        />
      ) : viewMode === "cards" ? (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-full flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
          ) : assets.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-500">
              No se encontraron activos
            </div>
          ) : (
            assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))
          )}
        </div>
      ) : (
        /* Table View */
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left w-12">
                    <span className="sr-only">Expandir</span>
                  </th>
                  {visibleColumns.map((col) => (
                    <th
                      key={col.id}
                      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="px-6 py-12 text-center"
                    >
                      <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto" />
                    </td>
                  </tr>
                ) : assets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="px-6 py-12 text-center text-gray-500"
                    >
                      No se encontraron activos
                    </td>
                  </tr>
                ) : (
                  assets.map((asset) => {
                    const isExpanded = expandedRows.has(asset.id);
                    return [
                      <tr key={asset.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 align-top">
                          <button
                            onClick={() => toggleRowExpansion(asset.id)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            aria-label={isExpanded ? "Contraer" : "Expandir"}
                          >
                            {isExpanded ? (
                              <ChevronUp size={16} className="text-gray-500" />
                            ) : (
                              <ChevronDown size={16} className="text-gray-500" />
                            )}
                          </button>
                        </td>

                        {/* Tipo */}
                        {visibleColumns.find((c) => c.id === "tipo") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <div className="flex items-center gap-2 text-gray-600">
                              {getCategoryIcon(asset.categoria.nombre)}
                              <span className="text-sm font-medium">
                                {asset.categoria.nombre}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Identificacion */}
                        {visibleColumns.find((c) => c.id === "identificacion") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <div>
                              {asset.numeroActivoInterno && (
                                <p className="text-sm font-medium text-gray-900">
                                  {asset.numeroActivoInterno}
                                </p>
                              )}
                              <p className="text-xs text-gray-500">
                                {asset.numeroSerie || "-"}
                              </p>
                              {asset.imei && (
                                <p className="text-xs text-gray-400">IMEI: {asset.imei}</p>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Marca/Modelo */}
                        {visibleColumns.find((c) => c.id === "marca") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {asset.marca}
                              </p>
                              <p className="text-xs text-gray-500">{asset.modelo}</p>
                            </div>
                          </td>
                        )}

                        {/* Estado */}
                        {visibleColumns.find((c) => c.id === "estado") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <span
                              className={cn(
                                "px-2 py-1 text-xs font-medium rounded-full",
                                estadoColors[asset.estado]
                              )}
                            >
                              {estadoLabels[asset.estado]}
                            </span>
                          </td>
                        )}

                        {/* Condicion */}
                        {visibleColumns.find((c) => c.id === "condicion") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <span
                              className={cn(
                                "px-2 py-1 text-xs font-medium rounded",
                                condicionColors[asset.condicion]
                              )}
                            >
                              {condicionLabels[asset.condicion]}
                            </span>
                          </td>
                        )}

                        {/* Asignado */}
                        {visibleColumns.find((c) => c.id === "asignado") && (
                          <td className="px-4 py-3 align-top">
                            {asset.empleadoActual ? (
                              <div className="max-w-xs">
                                <Link
                                  href={`/empleados/${asset.empleadoActual.id}`}
                                  className="text-sm font-medium text-gray-900 hover:text-blue-600 hover:underline transition-colors truncate block"
                                  title="Ver ficha del empleado"
                                >
                                  {asset.empleadoActual.nombres}{" "}
                                  {asset.empleadoActual.apellidoPaterno}
                                </Link>
                                {asset.empleadoActual.cargo && (
                                  <p className="text-xs text-gray-500 truncate">
                                    {asset.empleadoActual.cargo}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">Sin asignar</p>
                            )}
                          </td>
                        )}

                        {/* Especificaciones */}
                        {visibleColumns.find((c) => c.id === "specs") && (
                          <td className="px-4 py-3 align-top">
                            <div className="space-y-1 max-w-xs">
                              {asset.procesador && (
                                <div className="flex items-center gap-1 text-xs text-gray-600">
                                  <Cpu size={12} className="flex-shrink-0" />
                                  <span className="truncate">{asset.procesador}</span>
                                </div>
                              )}
                              {(asset.ram || asset.discoDuro) && (
                                <div className="flex items-center gap-1 text-xs text-gray-600">
                                  <HardDrive size={12} className="flex-shrink-0" />
                                  <span className="truncate">
                                    {asset.ram && `${asset.ram}`}
                                    {asset.ram && asset.discoDuro && " / "}
                                    {asset.discoDuro && `${asset.discoDuro}`}
                                  </span>
                                </div>
                              )}
                              {asset.sistemaOperativo && (
                                <p className="text-xs text-gray-500 truncate">
                                  {asset.sistemaOperativo}
                                </p>
                              )}
                              {!asset.procesador &&
                                !asset.ram &&
                                !asset.discoDuro &&
                                !asset.sistemaOperativo && (
                                  <p className="text-xs text-gray-400">-</p>
                                )}
                            </div>
                          </td>
                        )}

                        {/* Fecha Compra */}
                        {visibleColumns.find((c) => c.id === "fechaCompra") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            {asset.fechaCompra ? (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <Calendar size={14} className="text-gray-400" />
                                <span>
                                  {new Date(asset.fechaCompra).toLocaleDateString("es-CL")}
                                </span>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">-</p>
                            )}
                          </td>
                        )}

                        {/* Ubicacion */}
                        {visibleColumns.find((c) => c.id === "ubicacion") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            {asset.ubicacionFisica ? (
                              <div className="flex items-center gap-1 text-sm text-gray-600">
                                <MapPin size={14} className="text-gray-400" />
                                <span>{asset.ubicacionFisica}</span>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-400">-</p>
                            )}
                          </td>
                        )}

                        {/* Software */}
                        {visibleColumns.find((c) => c.id === "software") && (
                          <td className="px-4 py-3 whitespace-nowrap align-top">
                            <div className="flex flex-wrap gap-1">
                              {asset.microsoft365 && (
                                <span className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded border border-blue-200">
                                  M365
                                </span>
                              )}
                              {asset.intuneEnrolled && (
                                <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded border border-purple-200">
                                  Intune
                                </span>
                              )}
                              {!asset.microsoft365 && !asset.intuneEnrolled && (
                                <p className="text-sm text-gray-400">-</p>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Acciones */}
                        {visibleColumns.find((c) => c.id === "acciones") && (
                          <td className="px-4 py-3 whitespace-nowrap text-right align-top">
                            <div className="flex justify-end gap-1">
                              <Link
                                href={`/activos/${asset.id}`}
                                className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                title="Ver detalle"
                              >
                                <Eye size={16} />
                              </Link>
                              <Link
                                href={`/activos/${asset.id}/editar`}
                                className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                title="Editar"
                              >
                                <Edit size={16} />
                              </Link>
                            </div>
                          </td>
                        )}
                      </tr>,

                      /* Expanded Row Details */
                      isExpanded && (
                        <tr key={`${asset.id}-expanded`} className="bg-gray-50">
                          <td colSpan={visibleColumns.length + 1} className="px-4 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                              {/* Columna 1: Informacion General */}
                              <div className="space-y-2">
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                                  <Package size={16} />
                                  Informaci\u00f3n General
                                </h4>
                                <dl className="space-y-1">
                                  <div className="flex justify-between">
                                    <dt className="text-gray-500">Categor\u00eda:</dt>
                                    <dd className="font-medium text-gray-900">
                                      {asset.categoria.nombre}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-gray-500">Condici\u00f3n:</dt>
                                    <dd>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 text-xs font-medium rounded",
                                          condicionColors[asset.condicion]
                                        )}
                                      >
                                        {condicionLabels[asset.condicion]}
                                      </span>
                                    </dd>
                                  </div>
                                  {asset.fechaGarantiaFin && (
                                    <div className="flex justify-between">
                                      <dt className="text-gray-500">Garant\u00eda hasta:</dt>
                                      <dd className="text-gray-900">
                                        {new Date(asset.fechaGarantiaFin).toLocaleDateString(
                                          "es-CL"
                                        )}
                                      </dd>
                                    </div>
                                  )}
                                  {asset.numeroTelefono && (
                                    <div className="flex justify-between">
                                      <dt className="text-gray-500">Tel\u00e9fono:</dt>
                                      <dd className="text-gray-900">{asset.numeroTelefono}</dd>
                                    </div>
                                  )}
                                </dl>
                              </div>

                              {/* Columna 2: Asignacion */}
                              {asset.empleadoActual && (
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                                    <User size={16} />
                                    Usuario Asignado
                                  </h4>
                                  <dl className="space-y-1">
                                    <div className="flex justify-between">
                                      <dt className="text-gray-500">Nombre:</dt>
                                      <dd className="font-medium text-gray-900">
                                        {asset.empleadoActual.nombres}{" "}
                                        {asset.empleadoActual.apellidoPaterno}
                                      </dd>
                                    </div>
                                    {asset.empleadoActual.cargo && (
                                      <div className="flex justify-between">
                                        <dt className="text-gray-500">Cargo:</dt>
                                        <dd className="text-gray-900">
                                          {asset.empleadoActual.cargo}
                                        </dd>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <dt className="text-gray-500">Email:</dt>
                                      <dd className="text-gray-900 truncate max-w-[200px]">
                                        {asset.empleadoActual.correo}
                                      </dd>
                                    </div>
                                  </dl>
                                  <Link
                                    href={`/empleados/${asset.empleadoActual.id}`}
                                    className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium mt-2 transition-colors"
                                  >
                                    Ver ficha completa
                                    <ChevronRight size={14} />
                                  </Link>
                                </div>
                              )}

                              {/* Columna 3: Software y Licencias */}
                              <div className="space-y-2">
                                <h4 className="font-semibold text-gray-700 flex items-center gap-2">
                                  <Shield size={16} />
                                  Software y Gesti\u00f3n
                                </h4>
                                <dl className="space-y-1">
                                  <div className="flex justify-between">
                                    <dt className="text-gray-500">Microsoft 365:</dt>
                                    <dd>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 text-xs font-medium rounded",
                                          asset.microsoft365
                                            ? "bg-green-50 text-green-700"
                                            : "bg-gray-50 text-gray-600"
                                        )}
                                      >
                                        {asset.microsoft365 ? "S\u00ed" : "No"}
                                      </span>
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-gray-500">Intune:</dt>
                                    <dd>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 text-xs font-medium rounded",
                                          asset.intuneEnrolled
                                            ? "bg-green-50 text-green-700"
                                            : "bg-gray-50 text-gray-600"
                                        )}
                                      >
                                        {asset.intuneEnrolled ? "S\u00ed" : "No"}
                                      </span>
                                    </dd>
                                  </div>
                                  {asset.ubicacionFisica && (
                                    <div className="flex justify-between">
                                      <dt className="text-gray-500">Ubicaci\u00f3n:</dt>
                                      <dd className="text-gray-900">{asset.ubicacionFisica}</dd>
                                    </div>
                                  )}
                                </dl>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )
                    ];
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.total > 0 && (
            <div className="px-6 py-4 border-t bg-gray-50">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <p className="text-sm text-gray-700 font-medium">
                    Mostrando {(pagination.current - 1) * pagination.limit + 1} a{" "}
                    {Math.min(pagination.current * pagination.limit, pagination.total)} de{" "}
                    {pagination.total} activos
                  </p>
                  <div className="flex items-center gap-2">
                    <label htmlFor="items-per-page" className="text-sm text-gray-600">
                      Mostrar:
                    </label>
                    <select
                      id="items-per-page"
                      value={pagination.limit}
                      onChange={(e) => {
                        updateUrlParams({ limit: e.target.value, page: "1" });
                      }}
                      className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                    >
                      <option value="10">10</option>
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                    </select>
                  </div>
                </div>

                {pagination.pages > 1 && (
                  <nav
                    className="flex items-center gap-1"
                    aria-label="Navegaci\u00f3n de p\u00e1ginas"
                  >
                    <button
                      onClick={() => updateUrlParams({ page: String(pagination.current - 1) })}
                      disabled={pagination.current === 1}
                      className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                      aria-label="P\u00e1gina anterior"
                    >
                      <ChevronLeft size={20} className="text-gray-600" />
                    </button>

                    <div className="hidden sm:flex items-center gap-1">
                      {Array.from({ length: Math.min(pagination.pages, 7) }, (_, i) => {
                        let pageNum;
                        if (pagination.pages <= 7) {
                          pageNum = i + 1;
                        } else if (pagination.current <= 4) {
                          pageNum = i + 1;
                        } else if (pagination.current >= pagination.pages - 3) {
                          pageNum = pagination.pages - 6 + i;
                        } else {
                          pageNum = pagination.current - 3 + i;
                        }

                        const isCurrentPage = pageNum === pagination.current;

                        return (
                          <button
                            key={pageNum}
                            onClick={() => updateUrlParams({ page: String(pageNum) })}
                            disabled={isCurrentPage}
                            className={cn(
                              "min-w-[40px] h-10 px-3 rounded-lg border font-medium text-sm transition-colors",
                              isCurrentPage
                                ? "bg-blue-600 text-white border-blue-600 cursor-default"
                                : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                            )}
                            aria-current={isCurrentPage ? "page" : undefined}
                          >
                            {pageNum}
                          </button>
                        );
                      })}
                    </div>

                    <div className="sm:hidden px-4 py-2 text-sm font-medium text-gray-700">
                      P\u00e1gina {pagination.current} de {pagination.pages}
                    </div>

                    <button
                      onClick={() => updateUrlParams({ page: String(pagination.current + 1) })}
                      disabled={pagination.current === pagination.pages}
                      className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                      aria-label="P\u00e1gina siguiente"
                    >
                      <ChevronRight size={20} className="text-gray-600" />
                    </button>
                  </nav>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pagination for Cards View */}
      {viewMode === "cards" && pagination.total > 0 && (
        <div className="bg-white rounded-lg shadow px-6 py-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <p className="text-sm text-gray-700 font-medium">
                Mostrando {(pagination.current - 1) * pagination.limit + 1} a{" "}
                {Math.min(pagination.current * pagination.limit, pagination.total)} de{" "}
                {pagination.total} activos
              </p>
              <div className="flex items-center gap-2">
                <label htmlFor="items-per-page-cards" className="text-sm text-gray-600">
                  Mostrar:
                </label>
                <select
                  id="items-per-page-cards"
                  value={pagination.limit}
                  onChange={(e) => {
                    updateUrlParams({ limit: e.target.value, page: "1" });
                  }}
                  className="px-2 py-1 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="10">10</option>
                  <option value="25">25</option>
                  <option value="50">50</option>
                  <option value="100">100</option>
                </select>
              </div>
            </div>

            {pagination.pages > 1 && (
              <nav className="flex items-center gap-1" aria-label="Navegaci\u00f3n de p\u00e1ginas">
                <button
                  onClick={() => updateUrlParams({ page: String(pagination.current - 1) })}
                  disabled={pagination.current === 1}
                  className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                  aria-label="P\u00e1gina anterior"
                >
                  <ChevronLeft size={20} className="text-gray-600" />
                </button>

                <div className="hidden sm:flex items-center gap-1">
                  {Array.from({ length: Math.min(pagination.pages, 7) }, (_, i) => {
                    let pageNum;
                    if (pagination.pages <= 7) {
                      pageNum = i + 1;
                    } else if (pagination.current <= 4) {
                      pageNum = i + 1;
                    } else if (pagination.current >= pagination.pages - 3) {
                      pageNum = pagination.pages - 6 + i;
                    } else {
                      pageNum = pagination.current - 3 + i;
                    }

                    const isCurrentPage = pageNum === pagination.current;

                    return (
                      <button
                        key={pageNum}
                        onClick={() => updateUrlParams({ page: String(pageNum) })}
                        disabled={isCurrentPage}
                        className={cn(
                          "min-w-[40px] h-10 px-3 rounded-lg border font-medium text-sm transition-colors",
                          isCurrentPage
                            ? "bg-blue-600 text-white border-blue-600 cursor-default"
                            : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
                        )}
                        aria-current={isCurrentPage ? "page" : undefined}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <div className="sm:hidden px-4 py-2 text-sm font-medium text-gray-700">
                  P\u00e1gina {pagination.current} de {pagination.pages}
                </div>

                <button
                  onClick={() => updateUrlParams({ page: String(pagination.current + 1) })}
                  disabled={pagination.current === pagination.pages}
                  className="p-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white transition-colors"
                  aria-label="P\u00e1gina siguiente"
                >
                  <ChevronRight size={20} className="text-gray-600" />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}

      <Modal
        isOpen={!!bajaModalAssetId}
        onClose={() => setBajaModalAssetId(null)}
        title="Dar de baja"
        size="lg"
      >
        {bajaModalAssetId && (
          <BajaActivoForm
            assetId={bajaModalAssetId}
            onCancel={() => setBajaModalAssetId(null)}
            onSuccess={async () => {
              setAllAssets((prev) =>
                prev.map((a) => (a.id === bajaModalAssetId ? { ...a, estado: "baja" as Asset["estado"] } : a))
              );
              const statsRes = await fetch("/api/activos/stats");
              const statsData = await statsRes.json();
              setStats(statsData);
              setBajaModalAssetId(null);
            }}
          />
        )}
      </Modal>  
      
      <Modal
        isOpen={!!reasignarModalAssetId}
        onClose={() => setReasignarModalAssetId(null)}
        title="Reasignar Equipo"
        size="lg"
      >
        {reasignarModalAssetId && (
          <ReasignarActivoForm
            assetId={reasignarModalAssetId}
            onCancel={() => setReasignarModalAssetId(null)}
            onSuccess={async () => {
              setAllAssets((prev) =>
                prev.map((a) => (a.id === reasignarModalAssetId ? { ...a, estado: "asignado" as Asset["estado"] } : a))
              );
              const statsRes = await fetch("/api/activos/stats");
              const statsData = await statsRes.json();
              setStats(statsData);
              setReasignarModalAssetId(null);
            }}
          />
        )}
      </Modal>
    </div>
  );
}

export default function ActivosPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <ActivosPageContent />
    </Suspense>
  );
}
