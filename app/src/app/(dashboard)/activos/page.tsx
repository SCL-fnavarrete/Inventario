"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import {
  Plus,
  Download,
  Search,
  LayoutGrid,
  LayoutList,
  Kanban,
  Loader2,
  ListChecks
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
  TablaActivos,
  type ActivoFila,
} from "@/modules/activos/componentes";
import {
  FILTROS_DATO,
  type ParamFiltroDato,
  etiquetaEstadoActivo,
} from "@/modules/activos";
import { Can } from "@/shared/ui/Can";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { CONSULTA_CELULAR, useMediaQuery } from "@/shared/hooks/useMediaQuery";
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Pagination } from "@/shared/ui/Pagination";
import { logger } from "@/shared/logger";

type StatsData = {
  total: number;
  porLlegar: number | null;
  porRepartir: number;
  byStatus: {
    disponible: number;
    asignado: number;
    en_mantencion: number;
    baja: number;
    no_devuelto: number;
    en_transito: number;
    por_repartir: number;
  };
  byCategory: Array<{ id: string; nombre: string; count: number }>;
  byCondition: Record<string, number>;
};

type Pagination = {
  total: number;
  pages: number;
  current: number;
  limit: number;
};

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
  const [assets, setAssets] = useState<ActivoFila[]>([]);
  const [allAssets, setAllAssets] = useState<ActivoFila[]>([]);
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
        logger.error("Error fetching stats", error);
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
        logger.error("Error fetching assets", error);
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
          logger.error("Error fetching all assets", error);
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
            a.id === assetId ? { ...a, estado: newStatus as ActivoFila["estado"] } : a
          )
        );
        // Refresh stats
        const statsRes = await fetch(urlStats(filtrosSinEstado));
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (error) {
      logger.error("Error updating status", error);
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

  // Dar de baja: directo, con su motivo (SPEC 2.140). Las mantenciones
  // abiertas del equipo se cancelan.
  if (newStatus === "baja" && (currentStatus === "en_mantencion" || currentStatus === "disponible")) {
    router.push(`/activos/${assetId}/baja`);
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
            <Link href="/activos/catalogos" className={buttonClasses({ variant: "outline" })}>
              <ListChecks size={18} />
              <span className="hidden sm:inline">Catálogos</span>
            </Link>
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
        <TablaActivos
          assets={assets}
          loading={loading}
          paginacion={{
            current: pagination.current,
            pages: pagination.pages,
            total: pagination.total,
            limit: pagination.limit,
            itemLabel: "activos",
            onPageChange: (page) => updateUrlParams({ page: String(page) }),
            onLimitChange: (limit) => updateUrlParams({ limit: String(limit), page: "1" }),
          }}
        />
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
