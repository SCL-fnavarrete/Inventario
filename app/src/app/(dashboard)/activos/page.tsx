"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Download,
  Search,
  ChevronRight,
  Eye,
  Edit,
  Package,
  ChevronDown,
  ChevronUp,
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
import { cn } from "@/shared/cn";
import {
  StatsBar,
  CategoryTabs,
  ActiveFilters,
  AssetCard,
  KanbanBoard,
  ActivosTabs,
  FiltrosDatoActivo,
  textoFiltroDato,
  useOpcionesFiltroDato,
  CategoryIcon,
  AssetConditionBadge,
  AssetStatusBadge,
} from "@/modules/activos/componentes";
import {
  FILTROS_DATO,
  type ParamFiltroDato,
  etiquetaEstadoActivo,
  identificadorActivo,
  textoLineas,
} from "@/modules/activos";
import { Can } from "@/shared/ui/Can";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { CONSULTA_CELULAR, useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import type { EstadoActivo, CondicionActivo } from "@prisma/client";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Pagination } from "@/shared/ui/Pagination";
import { COLUMNA_FIJA_CELDA, COLUMNA_FIJA_ENCABEZADO } from "@/shared/ui/tablaStyles";

type Asset = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: EstadoActivo;
  condicion: CondicionActivo;
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
  lineas?: { numero: string; plan: string | null }[];
  categoria: {
    id: string;
    nombre: string;
  };
  sede: { id: string; nombre: string } | null;
  empleadoActual: {
    id: string;
    nombres: string;
    apellidoPaterno: string;
    correoEmpresa: string; // visible identifier
    correoPersonal?: string | null;
    cargo: string | null;
  } | null;
};

type StatsData = {
  total: number;
  porLlegar: number | null;
  porRepartir: number;
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

const DEFAULT_COLUMNS: ColumnConfig[] = [
  { id: "tipo", label: "Tipo", visible: true, required: true },
  { id: "identificacion", label: "N\u00b0 Serie", visible: true, required: true },
  { id: "marca", label: "Marca/Modelo", visible: true, required: true },
  { id: "estado", label: "Estado", visible: true, required: true },
  { id: "condicion", label: "Condici\u00f3n", visible: true },
  { id: "asignado", label: "Asignado a", visible: true },
  { id: "specs", label: "Especificaciones", visible: true },
  { id: "fechaCompra", label: "Fecha Compra", visible: false },
  { id: "sede", label: "Sede", visible: true },
  { id: "software", label: "Software", visible: false },
  { id: "acciones", label: "Acciones", visible: true, required: true },
];

/**
 * Filtros de la URL como parametros de la API. La lista, el tablero, las
 * tarjetas y el Excel piden lo mismo (SPEC 2.116.6); el tablero y las
 * tarjetas van sin el estado: el tablero lo muestra en columnas y las
 * tarjetas cuentan cada estado.
 */
function filtrosParaApi(sp: URLSearchParams, sede: string | null, conEstado = true): string {
  const p = new URLSearchParams();
  const estado = sp.get("estado");
  // "Por llegar" no es un estado: son los que vienen en camino a la sede (SPEC 2.108).
  if (conEstado && estado === "por_llegar") p.set("porLlegar", "1");
  else if (conEstado && estado) p.set("estado", estado);
  for (const clave of ["search", "categoriaId", ...FILTROS_DATO.map((d) => d.param)]) {
    const valor = sp.get(clave);
    if (valor) p.set(clave, valor);
  }
  if (sede) p.set("sedeId", sede);
  return p.toString();
}

const urlStats = (filtros: string) => `/api/activos/stats?${filtros}`;

function ActivosPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Global sede filter from the nav selector, kept across module navigation.
  const { sedeSeleccionada } = useSedeSeleccionada();

  // URL state
  const estadoFilter = searchParams.get("estado") || "";
  const categoriaFilter = searchParams.get("categoriaId") || "";
  const searchQuery = searchParams.get("search") || "";
  const currentPage = parseInt(searchParams.get("page") || "1");
  const limitParam = parseInt(searchParams.get("limit") || "20");
  const datosFilter = Object.fromEntries(FILTROS_DATO.map(({ param }) => [param, searchParams.get(param) ?? ""])) as Record<
    ParamFiltroDato,
    string
  >;
  const filtrosLista = filtrosParaApi(searchParams, sedeSeleccionada);
  const filtrosSinEstado = filtrosParaApi(searchParams, sedeSeleccionada, false);
  const opcionesDato = useOpcionesFiltroDato();

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
  // Debounced so the URL-driven search fires automatically as the user types.
  const debouncedSearchInput = useDebouncedValue(searchInput, 350);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  // Vista elegida por la persona; mientras no elija, en celular se abren las
  // tarjetas (la tabla no cabe) y en pantallas grandes la tabla.
  const [vistaElegida, setViewMode] = useState<"table" | "cards" | "kanban" | null>(null);
  const esCelular = useMediaQuery(CONSULTA_CELULAR);
  const viewMode = vistaElegida ?? (esCelular ? "cards" : "table");
  // El setter solo lo usaba handleStatusChange, que esta comentado mas
  // abajo (drag-and-drop de Kanban deshabilitado); isUpdatingStatus queda
  // en false, que es el comportamiento actual real.
  const [isUpdatingStatus] = useState(false);
  // Message shown when a Kanban card move is not allowed.
  const [kanbanError, setKanbanError] = useState<string | null>(null);

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

  // Applies the search to the URL once the debounce settles; the URL
  // remains the source of truth, so back/forward and shared links still work.
  useEffect(() => {
    if (debouncedSearchInput === searchQuery) return;
    updateUrlParams({ search: debouncedSearchInput || null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchInput]);

  // Fetch stats
  useEffect(() => {
    async function fetchStats() {
      setStatsLoading(true);
      try {
        const res = await fetch(urlStats(filtrosSinEstado));
        // Una respuesta de error no trae los conteos: se deja lo anterior en
        // vez de romper las tarjetas (antes se caia la pagina).
        if (res.ok) setStats(await res.json());
      } catch (error) {
        console.error("Error fetching stats:", error);
      } finally {
        setStatsLoading(false);
      }
    }
    fetchStats();
  }, [filtrosSinEstado]);

  // Fetch assets
  useEffect(() => {
    async function fetchAssets() {
      setLoading(true);
      try {
        const params = new URLSearchParams(filtrosLista);
        params.set("page", currentPage.toString());
        params.set("limit", limitParam.toString());

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
  }, [currentPage, limitParam, filtrosLista]);

  // Fetch all assets for Kanban view
  useEffect(() => {
    if (viewMode === "kanban") {
      async function fetchAllAssets() {
        try {
          const params = new URLSearchParams(filtrosSinEstado);
          params.set("limit", "1000");

          const res = await fetch(`/api/activos?${params}`);
          const data = await res.json();
          setAllAssets(data.data);
        } catch (error) {
          console.error("Error fetching all assets:", error);
        }
      }
      fetchAllAssets();
    }
  }, [viewMode, filtrosSinEstado]);

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
        const statsRes = await fetch(urlStats(filtrosSinEstado));
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
    setKanbanError(null);
    const asset = allAssets.find((a) => a.id == assetId);
    if (!asset) return;
    const currentStatus = asset.estado;

    //entregar un equipo disponible: debe quedar registrado como solicitud
  //(folio, pendientes de kit/EPP, confirmacion RRHH). No se asigna directo.
  if (currentStatus === "disponible" && newStatus === "asignado"){
    router.push("/solicitudes/nueva");
    return;
  }

  // Enviar a mantencion: se programa con "Iniciar ahora" marcada (SPEC 2.101).
  if ((currentStatus === "disponible" || currentStatus === "asignado") &&newStatus === "en_mantencion"){
    router.push(`/mantenciones/programar?activoId=${assetId}&iniciar=1`);
    return;
  }

  // Returning an assigned asset only happens through a Solicitud (change
  // of equipment or offboarding), which records the reason and document.
  if (currentStatus==="asignado" && (newStatus ==="disponible" || newStatus==="baja")){
    router.push("/solicitudes/nueva");
    return;
  }

  // Dar de baja: siempre por Mantenciones, con el equipo ya elegido (SPEC
  // 2.88). Si tiene una mantencion abierta, la pagina cierra esa.
  if (newStatus === "baja" && (currentStatus === "en_mantencion" || currentStatus === "disponible")) {
    router.push(`/mantenciones/baja?activoId=${assetId}`);
    return;
  }

  //vender un activo dado de baja: necesita comprador, monto y fecha
  if(currentStatus === "baja" && newStatus==="vendido"){
    router.push(`/activos/${assetId}/venta`);
    return;
  }

  // Despachar a otra sede: con una guia de despacho (SPEC 2.108).
  if (currentStatus === "disponible" && newStatus === "en_transito") {
    router.push("/despachos/nueva");
    return;
  }

  // Un equipo recien comprado se reparte desde su compra (SPEC 2.111).
  if (currentStatus === "por_repartir") {
    setKanbanError("Este equipo está por repartir: se reparte desde su compra, en Compras.");
    return;
  }

  // Un equipo en transito llega o se pierde en su guia, no desde el tablero.
  if (currentStatus === "en_transito") {
    setKanbanError(
      "Este equipo va en un despacho: cuando llegue, la sede destino confirma la recepción en Despachos."
    );
    return;
  }

  //salir de mantencion: no hay forma de preseleccionar la mantencion desde aca
  if(currentStatus=== "en_mantencion"){
    router.push("/mantenciones");
    return;
  }

  //Cualquier otra combinacion no tiene un camino definido todavia
  setKanbanError(
    `Desde el Kanban no se puede pasar un activo de "${etiquetaEstadoActivo(currentStatus)}" a "${etiquetaEstadoActivo(newStatus)}". Si el cambio corresponde, hazlo desde la pantalla del módulo que lleva ese registro.`
  );
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
      displayValue: estadoFilter === "por_llegar" ? "Por llegar" : etiquetaEstadoActivo(estadoFilter),
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
  for (const { param, etiqueta } of FILTROS_DATO) {
    const valor = datosFilter[param];
    if (valor) {
      activeFilters.push({ key: param, label: etiqueta, value: valor, displayValue: textoFiltroDato(param, valor, opcionesDato) });
    }
  }

  const visibleColumns = DEFAULT_COLUMNS.filter((col) => col.visible);

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title={
          <>
            Activos
          </>
        }
        description="Gestión de equipos y dispositivos IT"
        actions={
          <>
            <a
              href={`/api/activos/exportar?${filtrosLista}`}
              className={buttonClasses({ variant: "secondary" })}
            >
              <Download size={18} />
              <span className="hidden sm:inline">Exportar</span>
            </a>
            {/* Importar vive en Configuracion (SPEC 2.116.7). */}
            <Can recurso="activos">
              <Link href="/activos/nuevo" className={buttonClasses()}>
                <Plus size={18} />
                <span>Nuevo</span>
              </Link>
            </Can>
          </>
        }
      />

      {/* Tabs del modulo: Equipos (esta pagina) / Asignaciones / Personal /
          Kit de Bienvenida / EPP (ver ActivosTabs -- compartido entre las 5) */}
      {kanbanError && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-3 rounded-lg flex items-start justify-between gap-3">
          <span>{kanbanError}</span>
          <button
            onClick={() => setKanbanError(null)}
            className="text-amber-600 hover:text-amber-800 flex-shrink-0 font-medium"
            aria-label="Cerrar aviso"
          >
            ✕
          </button>
        </div>
      )}

      <ActivosTabs />

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
      <div className="card p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <form onSubmit={handleSearch} className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-subtle" />
            <input
              type="text"
              placeholder="Buscar por serie, marca, modelo o persona..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="field-input pl-10 pr-4"
            />
          </form>
        </div>

        {/* Filtros por datos de catalogo, combinables (SPEC 2.116.6) */}
        <FiltrosDatoActivo
          valores={datosFilter}
          opciones={opcionesDato}
          onChange={(param, valor) => updateUrlParams({ [param]: valor })}
        />

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
            <span className="text-sm text-fg-muted">Vista:</span>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button aria-label="Vista de tabla"
                onClick={() => setViewMode("table")}
                className={cn(
                  "p-2 rounded transition-colors",
                  viewMode === "table"
                    ? "bg-surface text-primary-700 shadow-sm"
                    : "text-fg-muted hover:text-fg"
                )}
                title="Vista de tabla"
              >
                <LayoutList size={18} />
              </button>
              <button aria-label="Vista de tarjetas"
                onClick={() => setViewMode("cards")}
                className={cn(
                  "p-2 rounded transition-colors",
                  viewMode === "cards"
                    ? "bg-surface text-primary-700 shadow-sm"
                    : "text-fg-muted hover:text-fg"
                )}
                title="Vista de tarjetas"
              >
                <LayoutGrid size={18} />
              </button>
              <button aria-label="Vista Kanban"
                onClick={() => setViewMode("kanban")}
                className={cn(
                  "p-2 rounded transition-colors",
                  viewMode === "kanban"
                    ? "bg-surface text-primary-700 shadow-sm"
                    : "text-fg-muted hover:text-fg"
                )}
                title="Vista Kanban"
              >
                <Kanban size={18} />
              </button>
            </div>
          </div>

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
        /* Vista de tarjetas: sin tilt (pueden ser cientos), solo acento
           por estado y hover simple (ver AssetCard). */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-4">
          {loading ? (
            <div className="col-span-full flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-fg-subtle" />
            </div>
          ) : assets.length === 0 ? (
            <div className="col-span-full text-center py-12 text-fg-subtle">
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
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-muted border-b">
                <tr>
                  <th className="px-3 py-3 text-left w-12">
                    <span className="sr-only">Expandir</span>
                  </th>
                  {visibleColumns.map((col) => (
                    <th
                      key={col.id}
                      className={cn(
                        "table-th px-3 whitespace-nowrap",
                        // Acciones fija a la derecha: la tabla es mas ancha que
                        // la pantalla y los botones quedaban fuera de vista.
                        col.id === "acciones" && COLUMNA_FIJA_ENCABEZADO
                      )}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {loading ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="px-6 py-12 text-center"
                    >
                      <Loader2 className="w-8 h-8 animate-spin text-fg-subtle mx-auto" />
                    </td>
                  </tr>
                ) : assets.length === 0 ? (
                  <tr>
                    <td
                      colSpan={visibleColumns.length + 1}
                      className="px-6 py-12 text-center text-fg-subtle"
                    >
                      No se encontraron activos
                    </td>
                  </tr>
                ) : (
                  assets.map((asset) => {
                    const isExpanded = expandedRows.has(asset.id);
                    return [
                      <tr key={asset.id} className="group hover:bg-surface-muted transition-colors">
                        <td className="px-3 py-3 align-top">
                          <button
                            onClick={() => toggleRowExpansion(asset.id)}
                            className="p-1 hover:bg-gray-200 rounded transition-colors"
                            aria-label={isExpanded ? "Contraer" : "Expandir"}
                          >
                            {isExpanded ? (
                              <ChevronUp size={16} className="text-fg-subtle" />
                            ) : (
                              <ChevronDown size={16} className="text-fg-subtle" />
                            )}
                          </button>
                        </td>

                        {/* Tipo */}
                        {visibleColumns.find((c) => c.id === "tipo") && (
                          <td className="px-3 py-3 whitespace-nowrap align-top">
                            <div className="flex items-center gap-2 text-fg-muted">
                              <CategoryIcon categoria={asset.categoria.nombre} className="h-5 w-5" />
                              <span className="text-sm font-medium">
                                {asset.categoria.nombre}
                              </span>
                            </div>
                          </td>
                        )}

                        {/* Identificacion */}
                        {visibleColumns.find((c) => c.id === "identificacion") && (
                          <td className="px-3 py-3 whitespace-nowrap align-top">
                            <div>
                              <Link
                                href={`/activos/${asset.id}`}
                                className="text-sm font-medium text-fg hover:text-primary-700 hover:underline"
                              >
                                {identificadorActivo(asset, "-")}
                              </Link>
                              {asset.imei && (
                                <p className="text-xs text-fg-subtle">IMEI: {asset.imei}</p>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Marca/Modelo: puede ir en dos lineas para que la tabla quepa. */}
                        {visibleColumns.find((c) => c.id === "marca") && (
                          <td className="px-3 py-3 align-top min-w-[9rem]">
                            <div>
                              <Link
                                href={`/activos/${asset.id}`}
                                className="block text-sm font-medium text-fg hover:text-primary-700 hover:underline"
                              >
                                {asset.marca}
                              </Link>
                              <p className="text-xs text-fg-subtle">{asset.modelo}</p>
                            </div>
                          </td>
                        )}

                        {/* Estado */}
                        {visibleColumns.find((c) => c.id === "estado") && (
                          <td className="px-3 py-3 whitespace-nowrap align-top">
                            <AssetStatusBadge status={asset.estado} size="sm" />
                          </td>
                        )}

                        {/* Condicion */}
                        {visibleColumns.find((c) => c.id === "condicion") && (
                          <td className="px-3 py-3 whitespace-nowrap align-top">
                            <AssetConditionBadge condicion={asset.condicion} />
                          </td>
                        )}

                        {/* Asignado */}
                        {visibleColumns.find((c) => c.id === "asignado") && (
                          <td className="px-3 py-3 align-top">
                            {asset.empleadoActual ? (
                              // 13rem: con max-w-xs la columna reservaba 320px y la
                              // tabla no cabia; un nombre largo se corta con "...".
                              <div className="max-w-[13rem]">
                                <Link
                                  href={`/empleados/${asset.empleadoActual.id}`}
                                  className="text-sm font-medium text-fg hover:text-primary-700 hover:underline transition-colors truncate block"
                                  title="Ver ficha del empleado"
                                >
                                  {asset.empleadoActual.nombres}{" "}
                                  {asset.empleadoActual.apellidoPaterno}
                                </Link>
                                {asset.empleadoActual.cargo && (
                                  <p className="text-xs text-fg-subtle truncate">
                                    {asset.empleadoActual.cargo}
                                  </p>
                                )}
                              </div>
                            ) : (
                              <p className="text-sm text-fg-subtle">Sin asignar</p>
                            )}
                          </td>
                        )}

                        {/* Especificaciones */}
                        {visibleColumns.find((c) => c.id === "specs") && (
                          <td className="px-3 py-3 align-top">
                            <div className="space-y-1 max-w-xs">
                              {asset.procesador && (
                                <div className="flex items-center gap-1 text-xs text-fg-muted">
                                  <Cpu size={12} className="flex-shrink-0" />
                                  <span className="truncate">{asset.procesador}</span>
                                </div>
                              )}
                              {(asset.ram || asset.discoDuro) && (
                                <div className="flex items-center gap-1 text-xs text-fg-muted">
                                  <HardDrive size={12} className="flex-shrink-0" />
                                  <span className="truncate">
                                    {asset.ram && `${asset.ram}`}
                                    {asset.ram && asset.discoDuro && " / "}
                                    {asset.discoDuro && `${asset.discoDuro}`}
                                  </span>
                                </div>
                              )}
                              {asset.sistemaOperativo && (
                                <p className="text-xs text-fg-subtle truncate">
                                  {asset.sistemaOperativo}
                                </p>
                              )}
                              {!asset.procesador &&
                                !asset.ram &&
                                !asset.discoDuro &&
                                !asset.sistemaOperativo && (
                                  <p className="text-xs text-fg-subtle">-</p>
                                )}
                            </div>
                          </td>
                        )}

                        {/* Fecha Compra */}
                        {visibleColumns.find((c) => c.id === "fechaCompra") && (
                          <td className="px-3 py-3 whitespace-nowrap align-top">
                            {asset.fechaCompra ? (
                              <div className="flex items-center gap-1 text-sm text-fg-muted">
                                <Calendar size={14} className="text-fg-subtle" />
                                <span>
                                  {formatearFecha(asset.fechaCompra)}
                                </span>
                              </div>
                            ) : (
                              <p className="text-sm text-fg-subtle">-</p>
                            )}
                          </td>
                        )}

                        {/* Sede */}
                        {visibleColumns.find((c) => c.id === "sede") && (
                          <td className="px-3 py-3 whitespace-nowrap align-top">
                            {asset.sede?.nombre ? (
                              <div className="flex items-center gap-1 text-sm text-fg-muted">
                                <MapPin size={14} className="text-fg-subtle" />
                                <span>{asset.sede.nombre}</span>
                              </div>
                            ) : (
                              <p className="text-sm text-fg-subtle">-</p>
                            )}
                          </td>
                        )}

                        {/* Software */}
                        {visibleColumns.find((c) => c.id === "software") && (
                          <td className="px-3 py-3 whitespace-nowrap align-top">
                            <div className="flex flex-wrap gap-1">
                              {asset.microsoft365 && (
                                <span className="px-2 py-0.5 text-xs bg-primary-50 text-primary-800 rounded border border-primary-200">
                                  M365
                                </span>
                              )}
                              {asset.intuneEnrolled && (
                                <span className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded border border-purple-200">
                                  Intune
                                </span>
                              )}
                              {!asset.microsoft365 && !asset.intuneEnrolled && (
                                <p className="text-sm text-fg-subtle">-</p>
                              )}
                            </div>
                          </td>
                        )}

                        {/* Acciones */}
                        {visibleColumns.find((c) => c.id === "acciones") && (
                          <td className={cn("px-3 py-3 whitespace-nowrap text-right align-top", COLUMNA_FIJA_CELDA)}>
                            <div className="flex justify-end gap-1">
                              <Link
                                href={`/activos/${asset.id}`}
                                className="p-2 text-fg-subtle hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                                title="Ver detalle"
                              >
                                <Eye size={16} />
                              </Link>
                              <Link
                                href={`/activos/${asset.id}/editar`}
                                className="p-2 text-fg-subtle hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
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
                        <tr key={`${asset.id}-expanded`} className="bg-surface-muted">
                          <td colSpan={visibleColumns.length + 1} className="px-4 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                              {/* Columna 1: Informacion General */}
                              <div className="space-y-2">
                                <h4 className="font-semibold text-fg-muted flex items-center gap-2">
                                  <Package size={16} />
                                  Información General
                                </h4>
                                <dl className="space-y-1">
                                  <div className="flex justify-between">
                                    <dt className="text-fg-subtle">Categoría:</dt>
                                    <dd className="font-medium text-fg">
                                      {asset.categoria.nombre}
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-fg-subtle">Condición:</dt>
                                    <dd>
                                      <AssetConditionBadge condicion={asset.condicion} />
                                    </dd>
                                  </div>
                                  {asset.fechaCompra && (
                                    <div className="flex justify-between">
                                      <dt className="text-fg-subtle">Fecha de compra:</dt>
                                      <dd className="text-fg">{formatearFecha(asset.fechaCompra)}</dd>
                                    </div>
                                  )}
                                  {asset.fechaGarantiaFin && (
                                    <div className="flex justify-between">
                                      <dt className="text-fg-subtle">Garantía hasta:</dt>
                                      <dd className="text-fg">
                                        {formatearFecha(asset.fechaGarantiaFin)}
                                      </dd>
                                    </div>
                                  )}
                                  {!!asset.lineas?.length && (
                                    <div className="flex justify-between">
                                      <dt className="text-fg-subtle">Línea:</dt>
                                      <dd className="text-fg">{textoLineas(asset.lineas)}</dd>
                                    </div>
                                  )}
                                </dl>
                              </div>

                              {/* Columna 2: Asignacion */}
                              {asset.empleadoActual && (
                                <div className="space-y-2">
                                  <h4 className="font-semibold text-fg-muted flex items-center gap-2">
                                    <User size={16} />
                                    Usuario Asignado
                                  </h4>
                                  <dl className="space-y-1">
                                    <div className="flex justify-between">
                                      <dt className="text-fg-subtle">Nombre:</dt>
                                      <dd className="font-medium text-fg">
                                        {asset.empleadoActual.nombres}{" "}
                                        {asset.empleadoActual.apellidoPaterno}
                                      </dd>
                                    </div>
                                    {asset.empleadoActual.cargo && (
                                      <div className="flex justify-between">
                                        <dt className="text-fg-subtle">Cargo:</dt>
                                        <dd className="text-fg">
                                          {asset.empleadoActual.cargo}
                                        </dd>
                                      </div>
                                    )}
                                    <div className="flex justify-between">
                                      <dt className="text-fg-subtle">Email:</dt>
                                      <dd className="text-fg truncate max-w-[200px]">
                                        {asset.empleadoActual.correoEmpresa ?? asset.empleadoActual.correoPersonal ?? ''}
                                      </dd>
                                    </div>
                                  </dl>
                                  <Link
                                    href={`/empleados/${asset.empleadoActual.id}`}
                                    className="inline-flex items-center gap-1 text-sm text-primary-700 hover:text-primary-800 font-medium mt-2 transition-colors"
                                  >
                                    Ver ficha completa
                                    <ChevronRight size={14} />
                                  </Link>
                                </div>
                              )}

                              {/* Columna 3: Software y Licencias */}
                              <div className="space-y-2">
                                <h4 className="font-semibold text-fg-muted flex items-center gap-2">
                                  <Shield size={16} />
                                  Software y Gestión
                                </h4>
                                <dl className="space-y-1">
                                  <div className="flex justify-between">
                                    <dt className="text-fg-subtle">Microsoft 365:</dt>
                                    <dd>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 text-xs font-medium rounded",
                                          asset.microsoft365
                                            ? "bg-green-50 text-green-700"
                                            : "bg-surface-muted text-fg-muted"
                                        )}
                                      >
                                        {asset.microsoft365 ? "S\u00ed" : "No"}
                                      </span>
                                    </dd>
                                  </div>
                                  <div className="flex justify-between">
                                    <dt className="text-fg-subtle">Intune:</dt>
                                    <dd>
                                      <span
                                        className={cn(
                                          "px-2 py-0.5 text-xs font-medium rounded",
                                          asset.intuneEnrolled
                                            ? "bg-green-50 text-green-700"
                                            : "bg-surface-muted text-fg-muted"
                                        )}
                                      >
                                        {asset.intuneEnrolled ? "S\u00ed" : "No"}
                                      </span>
                                    </dd>
                                  </div>
                                  {asset.sede?.nombre && (
                                    <div className="flex justify-between">
                                      <dt className="text-fg-subtle">Sede:</dt>
                                      <dd className="text-fg">{asset.sede.nombre}</dd>
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
            <div className="px-6 py-4 border-t bg-surface-muted">
              <Pagination
                current={pagination.current}
                pages={pagination.pages}
                total={pagination.total}
                limit={pagination.limit}
                itemLabel="activos"
                onPageChange={(page) => updateUrlParams({ page: String(page) })}
                onLimitChange={(limit) => updateUrlParams({ limit: String(limit), page: "1" })}
              />
            </div>
          )}
        </div>
      )}

      {/* Pagination for Cards View */}
      {viewMode === "cards" && pagination.total > 0 && (
        <div className="card px-6 py-4">
          <Pagination
            current={pagination.current}
            pages={pagination.pages}
            total={pagination.total}
            limit={pagination.limit}
            itemLabel="activos"
            onPageChange={(page) => updateUrlParams({ page: String(page) })}
            onLimitChange={(limit) => updateUrlParams({ limit: String(limit), page: "1" })}
          />
        </div>
      )}

    </div>
  );
}

export default function ActivosPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-fg-subtle" />
      </div>
    }>
      <ActivosPageContent />
    </Suspense>
  );
}
