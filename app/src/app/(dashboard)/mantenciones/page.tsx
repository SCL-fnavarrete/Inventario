"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wrench,
  Plus,
  Search,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/auth/Can";
import { EstadoMantencionBadge, MantencionesTabs } from "@/components/mantenciones";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { formatearFechaConHora } from "@/lib/utils/fechas";
import { estaVencida } from "@/lib/utils/mantenciones";
import { motivoSinBaja } from "@/lib/constants/estadosActivo";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatCard, StatGrid } from "@/components/ui/StatCard";

type TipoMantencion = {
  id: string;
  nombre: string;
  activo: boolean;
};

type Maintenance = {
  id: string;
  tipo: { id: string; nombre: string };
  descripcion: string;
  fechaProgramada: string | null;
  horaProgramada: string | null;
  fechaRealizada: string | null;
  proximaMantencion: string | null;
  realizadoPor: string | null;
  costo: number | null;
  proveedorExterno: string | null;
  estado: string;
  resultado: string | null;
  resultadoTipo: string | null;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    estado: string;
    categoria: {
      nombre: string;
    };
    empleadoActual: {
      id: string;
      rut: string;
      nombres: string;
      apellidoPaterno: string;
    } | null;
  };
};

type Stats = {
  totalVencidas: number;
  totalProximas: number;
  totalEnProceso: number;
  totalCompletadas: number;
};

// Period options for the "Proximas" and "Completadas" cards/filters.
// "todas" uses dias: 0 as a sentinel that both /api/mantenciones and
// /api/mantenciones/pendientes interpret as "no time window".
type Periodo = "dia" | "semana" | "mes" | "trimestre" | "semestre" | "anio" | "todas";
const PERIODOS: { value: Periodo; label: string; dias: number }[] = [
  { value: "dia", label: "Día", dias: 1 },
  { value: "semana", label: "Semana", dias: 7 },
  { value: "mes", label: "Mes", dias: 30 },
  { value: "trimestre", label: "Trimestre", dias: 90 },
  { value: "semestre", label: "6 meses", dias: 180 },
  { value: "anio", label: "Año", dias: 365 },
  { value: "todas", label: "Historial completo", dias: 0 },
];
function diasDePeriodo(periodo: Periodo): number {
  return PERIODOS.find((p) => p.value === periodo)?.dias ?? 30;
}

/** Fecha y hora programadas, en rojo si esta vencida. */
function FechaProgramada({ m }: { m: Maintenance }) {
  const vencida = estaVencida(m);
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-sm", vencida && "text-red-600 font-medium")}>
      {vencida && <AlertTriangle className="h-4 w-4 text-red-500" />}
      {formatearFechaConHora(m.fechaProgramada, m.horaProgramada, "-")}
    </span>
  );
}

/** Ver detalle y, si el equipo se puede dar de baja, el atajo a la baja. */
function AccionesMantencion({ m }: { m: Maintenance }) {
  const abierta = m.estado === "pendiente" || m.estado === "en_proceso";
  return (
    <>
      <Link
        href={`/mantenciones/${m.id}`}
        className="text-primary-700 hover:text-primary-900 text-sm font-medium"
      >
        Ver detalle
      </Link>
      {/* Baja por mantencion (SPEC 2.88): cierra esta misma. Solo si el
          equipo se puede dar de baja (no asignado ni no devuelto). */}
      {abierta && !motivoSinBaja(m.asset.estado) && (
        <Can recurso="mantenciones">
          <Link
            href={`/mantenciones/baja?activoId=${m.asset.id}`}
            className="ml-3 text-red-600 hover:text-red-800 text-sm font-medium"
          >
            Dar de baja
          </Link>
        </Can>
      )}
    </>
  );
}

export default function MantencionesPage() {
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [tiposMantencion, setTiposMantencion] = useState<TipoMantencion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Debounced so the search doesn't fire a request on every keystroke.
  const debouncedSearch = useDebouncedValue(search, 350);
  const [filterTipoId, setFilterTipoId] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [showVencidas, setShowVencidas] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Selecting a sede in the nav also filters this screen.
  const { sedeSeleccionada } = useSedeSeleccionada();
  // Single period filter shared by the "Proximas"/"Completadas" cards and
  // the table below, in the filter bar rather than per-card. Defaults to
  // "todas" so results aren't hidden by an implicit recent-only window.
  const [periodo, setPeriodo] = useState<Periodo>("todas");

  useEffect(() => {
    fetchTipos();
  }, []);

  useEffect(() => {
    fetchMaintenances();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filterTipoId, filterEstado, showVencidas, page, sedeSeleccionada, periodo]);

  useEffect(() => {
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodo, sedeSeleccionada]);

  async function fetchTipos() {
    try {
      const res = await fetch("/api/mantenciones/tipos");
      if (res.ok) {
        setTiposMantencion(await res.json());
      }
    } catch (error) {
      console.error("Error fetching tipos de mantención:", error);
    }
  }

  async function fetchMaintenances() {
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: "10",
      });

      if (debouncedSearch) params.append("search", debouncedSearch);
      if (filterTipoId) params.append("tipoId", filterTipoId);
      if (filterEstado) params.append("estado", filterEstado);
      if (showVencidas) params.append("vencidas", "true");
      if (sedeSeleccionada) params.append("sedeId", sedeSeleccionada);
      // Same period value used for the stat cards also scopes this list.
      const diasPeriodo = diasDePeriodo(periodo).toString();
      params.append("dias", diasPeriodo);
      params.append("diasCompletadas", diasPeriodo);

      const res = await fetch(`/api/mantenciones?${params}`);
      const data = await res.json();

      if (!res.ok) {
        console.error("Error fetching maintenances:", data.error || data);
        setMaintenances([]);
        setTotalPages(1);
        return;
      }

      setMaintenances(data.data || []);
      setTotalPages(data.pagination?.totalPages || 1);
    } catch (error) {
      console.error("Error fetching maintenances:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const dias = diasDePeriodo(periodo).toString();
      const params = new URLSearchParams({
        dias,
        diasCompletadas: dias,
      });
      if (sedeSeleccionada) params.append("sedeId", sedeSeleccionada);
      const res = await fetch(`/api/mantenciones/pendientes?${params}`);
      const data = await res.json();
      setStats(data.stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }

  // "Historial completo" no calza en "Próximas (…)": ahi se dice "todas".
  const periodoLabel =
    periodo === "todas" ? "todas" : PERIODOS.find((p) => p.value === periodo)?.label.toLowerCase();

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Mantenciones"
        description="Gestión de mantenciones preventivas y correctivas"
        actions={
          <>
            <Can recurso="mantenciones">
              <Link
                href="/mantenciones/programar"
                className={buttonClasses()}
              >
                <Plus size={20} />
                Programar Mantención
              </Link>
            </Can>
          </>
        }
      />

      <MantencionesTabs />

      {/* Stats Cards */}
      <StatGrid cols={4}>
        <StatCard tilt label="Vencidas" value={stats?.totalVencidas || 0} tone="danger" icon={AlertTriangle} />
        <StatCard
          tilt
          label={`Próximas (${periodoLabel})`}
          value={stats?.totalProximas || 0}
          tone="orange"
          icon={Calendar}
        />
        <StatCard tilt label="En Proceso" value={stats?.totalEnProceso || 0} tone="primary" icon={Wrench} />
        <StatCard
          tilt
          label={`Completadas (${periodoLabel})`}
          value={stats?.totalCompletadas || 0}
          tone="success"
          icon={CheckCircle}
        />
      </StatGrid>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-subtle" />
            <input
              type="text"
              placeholder="Buscar por activo (marca, modelo, serie...) o empleado asignado..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="field-input pl-10 pr-4"
            />
          </div>

          <select
            value={filterTipoId}
            onChange={(e) => {
              setFilterTipoId(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos los tipos</option>
            {tiposMantencion.map((tipo) => (
              <option key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </option>
            ))}
          </select>

          <select
            value={filterEstado}
            onChange={(e) => {
              setFilterEstado(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En Proceso</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
          </select>

          {/* Period filter: scopes the "Proximas"/"Completadas" cards and
              the table below. Vencidas/en proceso are always shown without
              a time window; proximas/completadas respect the chosen period. */}
          <select
            value={periodo}
            onChange={(e) => {
              setPeriodo(e.target.value as Periodo);
              setPage(1);
            }}
            className="px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500"
            title="Período: acota las tarjetas Próximas/Completadas y la tabla de abajo"
          >
            {PERIODOS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setShowVencidas(!showVencidas);
              setPage(1);
            }}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors",
              showVencidas
                ? "bg-red-50 border-red-300 text-red-700"
                : "border-line-strong text-fg-muted hover:bg-surface-muted"
            )}
          >
            <AlertTriangle size={20} />
            Vencidas
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-fg-subtle" />
          </div>
        ) : maintenances.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-fg-subtle">
            <Wrench className="h-12 w-12 mb-4 text-gray-300" />
            <p>No se encontraron mantenciones</p>
          </div>
        ) : (
          <>
            {/* Celular: una tarjeta por mantencion, con todo a la vista. */}
            <ul className="md:hidden divide-y divide-line">
              {maintenances.map((m) => (
                <li key={m.id} className={cn("p-4 space-y-2", estaVencida(m) && "bg-red-50")}>
                  <div className="flex items-start justify-between gap-3">
                    <Link href={`/mantenciones/${m.id}`} className="flex items-center gap-2 min-w-0">
                      <span className="text-fg-subtle flex-shrink-0">
                        <CategoryIcon categoria={m.asset.categoria.nombre} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-sm text-fg truncate">
                          {m.asset.marca} {m.asset.modelo}
                        </span>
                        <span className="block text-xs text-fg-subtle truncate">
                          {m.tipo.nombre} · {m.asset.numeroSerie || "Sin serie"}
                        </span>
                      </span>
                    </Link>
                    <EstadoMantencionBadge mantencion={m} />
                  </div>
                  <p className="text-sm text-fg-muted line-clamp-2">{m.descripcion}</p>
                  <div className="flex items-center justify-between gap-3">
                    <FechaProgramada m={m} />
                    <span className="text-right">
                      <AccionesMantencion m={m} />
                    </span>
                  </div>
                </li>
              ))}
            </ul>

            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-muted border-b">
                  <tr>
                    <th className="table-th px-4">
                      Activo
                    </th>
                    <th className="table-th px-4">
                      Tipo
                    </th>
                    <th className="table-th px-4">
                      Descripción
                    </th>
                    <th className="table-th px-4">
                      Fecha Programada
                    </th>
                    <th className="table-th px-4">
                      Estado
                    </th>
                    <th className="table-th px-4">
                      Técnico
                    </th>
                    <th className="table-th px-4 text-right">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {maintenances.map((maintenance) => {
                    const overdue = estaVencida(maintenance);

                    return (
                      <tr key={maintenance.id} className={cn("hover:bg-surface-muted", overdue && "bg-red-50")}>
                        <td className="px-4 py-4">
                          <Link href={`/mantenciones/${maintenance.id}`} className="flex items-center gap-3 group">
                            <span className="text-fg-subtle">
                              <CategoryIcon categoria={maintenance.asset.categoria.nombre} className="h-4 w-4" />
                            </span>
                            <div>
                              <p className="font-medium text-sm group-hover:text-primary-700">
                                {maintenance.asset.marca} {maintenance.asset.modelo}
                              </p>
                              <p className="text-xs text-fg-subtle">
                                {maintenance.asset.numeroSerie || "Sin serie"}
                              </p>
                            </div>
                          </Link>
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-fg-muted rounded">
                            {maintenance.tipo.nombre}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-fg line-clamp-2 max-w-xs">
                            {maintenance.descripcion}
                          </p>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">
                          <FechaProgramada m={maintenance} />
                        </td>
                        <td className="px-4 py-4">
                          <EstadoMantencionBadge mantencion={maintenance} />
                        </td>
                        <td className="px-4 py-4 text-sm text-fg-subtle">
                          {maintenance.realizadoPor || "-"}
                        </td>
                        <td className="px-4 py-4 text-right whitespace-nowrap">
                          <AccionesMantencion m={maintenance} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <p className="text-sm text-fg-subtle">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border rounded hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 border rounded hover:bg-surface-muted disabled:opacity-50 disabled:cursor-not-allowed"
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
