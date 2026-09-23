"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  User,
  Users,
  UserX,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ActivosTabs } from "@/components/activos";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import type { EstadoEmpleado, TipoContrato } from "@prisma/client";
import { PageHeader } from "@/components/ui/PageHeader";

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
  tipoContrato: TipoContrato;
  estado: EstadoEmpleado;
  fechaIngreso: string | null;
  origenMicrosoft?: boolean;
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
  const { data: session } = useSession();
  // Selecting a sede in the nav also filters this screen.
  const { sedeSeleccionada } = useSedeSeleccionada();
  // Sede filter (local to this screen) is admin-only, like the legacy
  // ubicacion filter it replaces.
  const esAdmin = session?.user?.role === "admin";
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
  }, [pagination.page, debouncedSearch, estadoFilter, tipoContratoFilter, sedeFilter, sedeSeleccionada]);

  useEffect(() => {
    if (esAdmin) {
      fetchSedes();
    }
    fetchStats();
    // Recompute stat cards when the sede filter changes so they don't stay
    // stuck on the global total while the table below is already filtered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esAdmin, sedeSeleccionada]);

  async function fetchSedes() {
    try {
      const res = await fetch("/api/sedes?activas=true");
      const data = await res.json();
      setSedes(data);
    } catch (error) {
      console.error("Error fetching sedes:", error);
    }
  }

  async function fetchStats() {
    try {
      // Apply the same sede filter as fetchEmployees so the stats match.
      const sedeParam = sedeSeleccionada ? `&sedeId=${sedeSeleccionada}` : "";
      const res = await fetch(`/api/empleados?limit=100${sedeParam}`);
      const data = await res.json();

      if (!res.ok || !data.data) {
        console.error("Error fetching stats:", data.error);
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
      console.error("Error fetching stats:", error);
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
      console.error("Error fetching employees:", error);
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
      <div className={cn("grid grid-cols-1 gap-4", esAdmin ? "md:grid-cols-4" : "md:grid-cols-3")}>
        {/* Total Empleados - Reset Filter */}
        <button
          onClick={() => handleStatClick("reset")}
          disabled={!hasActiveFilters}
          className={cn(
            "bg-white rounded-lg shadow p-4 text-left transition-all",
            hasActiveFilters
              ? "hover:shadow-md hover:scale-105 cursor-pointer"
              : "opacity-75",
            !hasActiveFilters && "ring-2 ring-primary-500 ring-offset-2"
          )}
          aria-label="Ver todos los empleados - limpiar filtros"
          title={hasActiveFilters ? "Click para limpiar filtros" : "Mostrando todos"}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Users className="h-6 w-6 text-primary-700" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Empleados</p>
              <p className="text-xl font-bold">{stats.totalEmpleados}</p>
            </div>
          </div>
          {!hasActiveFilters && (
            <p className="text-xs text-primary-700 mt-2 font-medium">Sin filtros activos</p>
          )}
        </button>

        {/* Activos - Filter Toggle */}
        <button
          onClick={() => handleStatClick("activo")}
          className={cn(
            "bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md hover:scale-105 cursor-pointer",
            estadoFilter === "activo" && "ring-2 ring-green-500 ring-offset-2"
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
              <p className="text-sm text-gray-500">Activos</p>
              <p className="text-xl font-bold">{stats.activos}</p>
            </div>
          </div>
          {estadoFilter === "activo" && (
            <p className="text-xs text-green-600 mt-2 font-medium">Filtro activo</p>
          )}
        </button>

        {/* Desvinculados - Filter Toggle */}
        <button
          onClick={() => handleStatClick("desvinculado")}
          className={cn(
            "bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md hover:scale-105 cursor-pointer",
            estadoFilter === "desvinculado" && "ring-2 ring-red-500 ring-offset-2"
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
              <p className="text-sm text-gray-500">Desvinculados</p>
              <p className="text-xl font-bold">{stats.desvinculados}</p>
            </div>
          </div>
          {estadoFilter === "desvinculado" && (
            <p className="text-xs text-red-600 mt-2 font-medium">Filtro activo</p>
          )}
        </button>

      </div>

      {/* Filters */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
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
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Todos los contratos</option>
              {Object.entries(tipoContratoLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {esAdmin && (
              <select
                value={sedeFilter}
                onChange={(e) => {
                  setSedeFilter(e.target.value);
                  setPagination((prev) => ({ ...prev, page: 1 }));
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Todas las sedes</option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
            )}
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="table-th">
                  RUT
                </th>
                <th className="table-th">
                  Nombre
                </th>
                <th className="table-th">
                  Correo
                </th>
                <th className="table-th">
                  Cargo
                </th>
                <th className="table-th">
                  Jefe
                </th>
                <th className="table-th">
                  Supervisor
                </th>
                <th className="table-th">
                  Ubicación
                </th>
                <th className="table-th">
                  Sede
                </th>
                <th className="table-th">
                  Contrato
                </th>
                <th className="table-th">
                  Estado
                </th>
                <th className="table-th">
                  Equipos
                </th>
                <th className="table-th text-right">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron empleados
                  </td>
                </tr>
              ) : (
                employees.map((employee) => (
                  <tr key={employee.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono text-gray-900">
                        {employee.rut || "—"}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm font-medium text-gray-900">
                        {employee.nombres} {employee.apellidoPaterno}
                        {employee.origenMicrosoft && (
                          <span className="ml-1.5 inline-flex items-center text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-normal">
                            Microsoft
                          </span>
                        )}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-600">{employee.correoPersonal ?? employee.correoEmpresa ?? ''}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">
                        {employee.cargo || "-"}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-600">{employee.jefatura || "-"}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-600">{employee.supervisor || "-"}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-600">{employee.ubicacion || "-"}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-600">{employee.sede?.nombre || "-"}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-full",
                          tipoContratoColors[employee.tipoContrato]
                        )}
                      >
                        {tipoContratoLabels[employee.tipoContrato]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-full",
                          estadoColors[employee.estado]
                        )}
                      >
                        {estadoLabels[employee.estado]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">
                        {employee._count.assignments} equipos
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/empleados/${employee.id}`}
                          className="p-2 text-gray-500 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
                          title="Ver ficha"
                        >
                          <Eye size={18} />
                        </Link>
                        <Link
                          href={`/empleados/${employee.id}/editar`}
                          className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Edit size={18} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Mostrando {(pagination.page - 1) * pagination.limit + 1} a{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)} de{" "}
              {pagination.total} empleados
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                }
                disabled={pagination.page === 1}
                className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                }
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={20} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
