"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Search,
  Eye,
  Edit,
  User,
  Users,
  UserX,
} from "lucide-react";
import { cn } from "@/shared/cn";
import { Tilt } from "@/shared/ui/Tilt";
import { TONO_ACENTO } from "@/shared/constantes/tonos";
import { ActivosTabs } from "@/modules/activos/componentes";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import type { EstadoEmpleado, TipoContrato } from "@prisma/client";
import { PageHeader } from "@/shared/ui/PageHeader";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { logger } from "@/shared/logger";

// Read-only employee listing within Activos. Employees are created via the
// onboarding flow; detail/edit lives in /empleados/[id].

type Employee = {
  id: string;
  rut: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correoEmpresa: string; // required field
  correoPersonal?: string | null;
  cargo: string | null;
  jefatura: string | null;
  supervisor: string | null;
  ubicacion: string | null;
  sede: { id: string; nombre: string } | null;
  tipoContrato: TipoContrato | null; // null: importado, aun sin definir
  estado: EstadoEmpleado;
  fechaIngreso: string | null;
  _count: {
    assignments: number;
    kitAssignments: number;
  };
};

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

type Stats = {
  totalEmpleados: number;
  activos: number;
  desvinculados: number;
};

const estadoColors: Record<EstadoEmpleado, string> = {
  activo: "bg-green-100 text-green-800",
  desvinculado: "bg-red-100 text-red-800",
  licencia: "bg-yellow-100 text-yellow-800",
};

const estadoLabels: Record<EstadoEmpleado, string> = {
  activo: "Activo",
  desvinculado: "Desvinculado",
  licencia: "En Licencia",
};

const tipoContratoLabels: Record<TipoContrato, string> = {
  contrato: "Contrato",
  boleta: "Boleta",
};

const tipoContratoColors: Record<TipoContrato, string> = {
  contrato: "bg-primary-100 text-primary-900",
  boleta: "bg-purple-100 text-purple-800",
};

export default function PersonalPage() {
  // Selecting a sede in the nav also filters this screen.
  const { sedeSeleccionada } = useSedeSeleccionada();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Debounced so the search fires automatically as the user types.
  const debouncedSearch = useDebouncedValue(search, 350);
  const [estadoFilter, setEstadoFilter] = useState("");
  const [tipoContratoFilter, setTipoContratoFilter] = useState("");
  const [sedeFilter, setSedeFilter] = useState("");
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalEmpleados: 0,
    activos: 0,
    desvinculados: 0,
  });

  useEffect(() => {
    fetchEmployees();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, pagination.limit, debouncedSearch, estadoFilter, tipoContratoFilter, sedeFilter, sedeSeleccionada]);

  useEffect(() => {
    fetchSedes();
    fetchStats();
    // Recompute stat cards when the sede filter changes so they don't stay
    // stuck on the global total while the table below is already filtered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeSeleccionada]);

  async function fetchSedes() {
    try {
      const res = await fetch("/api/sedes");
      const data = await res.json();
      setSedes(data);
    } catch (error) {
      logger.error("Error fetching sedes", error);
    }
  }

  async function fetchStats() {
    try {
      // Apply the same sede filter as fetchEmployees so the stats match.
      const sedeParam = sedeSeleccionada ? `&sedeId=${sedeSeleccionada}` : "";
      const res = await fetch(`/api/empleados?limit=100${sedeParam}`);
      const data = await res.json();

      if (!res.ok || !data.data) {
        logger.error("Error fetching stats", data.error);
        return;
      }

      const allEmployees: Employee[] = [...data.data];
      const totalPages = data.pagination?.totalPages || 1;

      if (totalPages > 1) {
        const promises = [];
        for (let page = 2; page <= Math.min(totalPages, 10); page++) {
          promises.push(fetch(`/api/empleados?limit=100&page=${page}${sedeParam}`).then((r) => r.json()));
        }
        const results = await Promise.all(promises);
        results.forEach((result) => {
          if (result.data) {
            allEmployees.push(...result.data);
          }
        });
      }

      const activos = allEmployees.filter((e: Employee) => e.estado === "activo").length;
      const desvinculados = allEmployees.filter((e: Employee) => e.estado === "desvinculado").length;

      setStats({
        totalEmpleados: data.pagination?.total || 0,
        activos,
        desvinculados,
      });
    } catch (error) {
      logger.error("Error fetching stats", error);
    }
  }

  // `searchOverride` lets an explicit Enter search use the current input
  // value immediately, instead of waiting for the debounce to catch up.
  async function fetchEmployees(searchOverride?: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      const terminoBusqueda = searchOverride ?? debouncedSearch;
      if (terminoBusqueda) params.append("search", terminoBusqueda);
      if (estadoFilter) params.append("estado", estadoFilter);
      if (tipoContratoFilter) params.append("tipoContrato", tipoContratoFilter);
      // sedeFilter (local, admin-only) narrows further within whatever the
      // global nav sede filter already scopes to; both map to the same
      // sedeId param, so the local one takes precedence when set.
      if (sedeFilter) params.append("sedeId", sedeFilter);
      else if (sedeSeleccionada) params.append("sedeId", sedeSeleccionada);

      const res = await fetch(`/api/empleados?${params}`);
      const data = await res.json();
      setEmployees(data.data);
      setPagination(data.pagination);
    } catch (error) {
      logger.error("Error fetching employees", error);
    } finally {
      setLoading(false);
    }
  }

  // Enter still forces an immediate search without waiting for the debounce.
  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchEmployees(search);
  }

  function handleStatClick(filterType: "activo" | "desvinculado" | "reset") {
    if (filterType === "reset") {
      setEstadoFilter("");
      setTipoContratoFilter("");
      setSedeFilter("");
      setSearch("");
      setPagination((prev) => ({ ...prev, page: 1 }));
    } else {
      setEstadoFilter((prev) => (prev === filterType ? "" : filterType));
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }

  const hasActiveFilters = estadoFilter || tipoContratoFilter || sedeFilter || search;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Personal"
        description="Colaboradores y sus asignaciones de equipos — se crean desde Solicitudes (Onboarding)"
      />

      {/* Tabs del modulo: Equipos / Asignaciones / Personal (esta pagina) /
          Kit de Bienvenida / EPP (ver ActivosTabs -- compartido entre las 5) */}
      <ActivosTabs />

      {/* Stats - Interactive Cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Total Empleados - Reset Filter */}
        <Tilt>
          <button
            onClick={() => handleStatClick("reset")}
            disabled={!hasActiveFilters}
            className={cn(
              "card-feature h-full w-full p-4 text-left",
              TONO_ACENTO.primary,
              !hasActiveFilters && "ring-2 ring-[var(--card-accent)] ring-offset-2 ring-offset-canvas"
            )}
            aria-label="Ver todos los empleados - limpiar filtros"
            title={hasActiveFilters ? "Click para limpiar filtros" : "Mostrando todos"}
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <Users className="h-6 w-6 text-primary-700" />
              </div>
              <div>
                <p className="text-sm text-fg-subtle">Total Empleados</p>
                <p className="text-xl font-bold">{stats.totalEmpleados}</p>
              </div>
            </div>
            {!hasActiveFilters && (
              <p className="text-xs text-primary-700 mt-2 font-medium">Sin filtros activos</p>
            )}
          </button>
        </Tilt>

        {/* Activos - Filter Toggle */}
        <Tilt>
          <button
            onClick={() => handleStatClick("activo")}
            className={cn(
              "card-feature h-full w-full p-4 text-left",
              TONO_ACENTO.success,
              estadoFilter === "activo" && "ring-2 ring-[var(--card-accent)] ring-offset-2 ring-offset-canvas"
            )}
            aria-label="Filtrar empleados activos"
            aria-pressed={estadoFilter === "activo"}
            title="Click para filtrar por empleados activos"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <User className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-fg-subtle">Activos</p>
                <p className="text-xl font-bold">{stats.activos}</p>
              </div>
            </div>
            {estadoFilter === "activo" && (
              <p className="text-xs text-green-600 mt-2 font-medium">Filtro activo</p>
            )}
          </button>
        </Tilt>

        {/* Desvinculados - Filter Toggle */}
        <Tilt>
          <button
            onClick={() => handleStatClick("desvinculado")}
            className={cn(
              "card-feature h-full w-full p-4 text-left",
              TONO_ACENTO.danger,
              estadoFilter === "desvinculado" && "ring-2 ring-[var(--card-accent)] ring-offset-2 ring-offset-canvas"
            )}
            aria-label="Filtrar empleados desvinculados"
            aria-pressed={estadoFilter === "desvinculado"}
            title="Click para filtrar por empleados desvinculados"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <UserX className="h-6 w-6 text-red-600" />
              </div>
              <div>
                <p className="text-sm text-fg-subtle">Desvinculados</p>
                <p className="text-xl font-bold">{stats.desvinculados}</p>
              </div>
            </div>
            {estadoFilter === "desvinculado" && (
              <p className="text-xs text-red-600 mt-2 font-medium">Filtro activo</p>
            )}
          </button>
        </Tilt>

      </div>

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-subtle" />
            <input
              type="text"
              placeholder="Buscar por RUT, nombre, correo, cargo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="field-input pl-10 pr-4"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={tipoContratoFilter}
              onChange={(e) => {
                setTipoContratoFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Todos los contratos</option>
              {Object.entries(tipoContratoLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {/* Filtro por sede, para todos (SPEC 2.117). */}
            <select
              value={sedeFilter}
              onChange={(e) => {
                setSedeFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Todas las sedes</option>
              {sedes.map((sede) => (
                <option key={sede.id} value={sede.id}>
                  {sede.nombre}
                </option>
              ))}
            </select>
          </div>
        </form>
      </div>

      {/* Tabla */}
      <TablaDatos
        items={employees}
        clave={(e) => e.id}
        cargando={loading}
        vacio="No se encontraron empleados"
        compacta
        // En celular, una tarjeta por persona: la tabla de 11 columnas no se lee.
        tarjeta={(e) => (
          <>
            <div className="flex items-start justify-between gap-2">
              <Link href={`/empleados/${e.id}`} className="font-medium text-fg hover:text-primary-700">
                {e.nombres} {e.apellidoPaterno}
              </Link>
              <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium", estadoColors[e.estado])}>{estadoLabels[e.estado]}</span>
            </div>
            <p className="font-mono text-xs text-fg-subtle">{e.rut || "—"}</p>
            {(e.correoPersonal ?? e.correoEmpresa) && (
              <p className="truncate text-xs text-fg-muted">{e.correoPersonal ?? e.correoEmpresa}</p>
            )}
            <p className="text-xs text-fg-subtle">
              {e.sede?.nombre || "Sin sede"} · {e._count.assignments} equipos
            </p>
          </>
        )}
        columnas={[
          { titulo: "RUT", sinSalto: true, className: "px-6 font-mono text-fg", celda: (e) => e.rut || "—" },
          {
            titulo: "Nombre",
            sinSalto: true,
            className: "px-6 font-medium text-fg",
            celda: (e) => (
              <Link href={`/empleados/${e.id}`} className="hover:text-primary-700 hover:underline">
                {e.nombres} {e.apellidoPaterno}
              </Link>
            ),
          },
          { titulo: "Correo", sinSalto: true, className: "px-6 text-fg-muted", celda: (e) => e.correoPersonal ?? e.correoEmpresa ?? "" },
          { titulo: "Cargo", sinSalto: true, className: "px-6 text-fg", celda: (e) => e.cargo || "-" },
          { titulo: "Jefe", sinSalto: true, className: "px-6 text-fg-muted", celda: (e) => e.jefatura || "-" },
          { titulo: "Supervisor", sinSalto: true, className: "px-6 text-fg-muted", celda: (e) => e.supervisor || "-" },
          { titulo: "Ubicación", sinSalto: true, className: "px-6 text-fg-muted", celda: (e) => e.ubicacion || "-" },
          { titulo: "Sede", sinSalto: true, className: "px-6 text-fg-muted", celda: (e) => e.sede?.nombre || "-" },
          {
            titulo: "Contrato",
            sinSalto: true,
            className: "px-6",
            celda: (e) => (
              <span
                className={cn(
                  "rounded-full px-2 py-1 text-xs font-medium",
                  e.tipoContrato ? tipoContratoColors[e.tipoContrato] : "bg-surface-muted text-fg-muted"
                )}
              >
                {e.tipoContrato ? tipoContratoLabels[e.tipoContrato] : "Sin definir"}
              </span>
            ),
          },
          {
            titulo: "Estado",
            sinSalto: true,
            className: "px-6",
            celda: (e) => (
              <span className={cn("rounded-full px-2 py-1 text-xs font-medium", estadoColors[e.estado])}>{estadoLabels[e.estado]}</span>
            ),
          },
          { titulo: "Equipos", sinSalto: true, className: "px-6 text-fg-muted", celda: (e) => `${e._count.assignments} equipos` },
        ]}
        acciones={(e) => (
          <>
            <Link
              href={`/empleados/${e.id}`}
              className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-primary-50 hover:text-primary-700"
              title="Ver ficha"
              aria-label="Ver ficha"
            >
              <Eye size={18} />
            </Link>
            <Link
              href={`/empleados/${e.id}/editar`}
              className="rounded-lg p-2 text-fg-subtle transition-colors hover:bg-green-50 hover:text-green-600"
              title="Editar"
              aria-label="Editar"
            >
              <Edit size={18} />
            </Link>
          </>
        )}
        paginacion={{
          current: pagination.page,
          pages: pagination.totalPages,
          total: pagination.total,
          limit: pagination.limit,
          itemLabel: "empleados",
          onPageChange: (page) => setPagination((prev) => ({ ...prev, page })),
          onLimitChange: (limit) => setPagination((prev) => ({ ...prev, limit, page: 1 })),
        }}
      />
    </div>
  );
}
