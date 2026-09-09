"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Upload,
  Download,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  Edit,
  User,
  Users,
  Building,
  MapPin,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/auth/Can";
import type { EstadoEmpleado, TipoContrato } from "@prisma/client";

type Employee = {
  id: string;
  rut: string | null;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correoPersonal: string;
  cargo: string | null;
  jefatura: string | null;
  ubicacion: string | null;
  tipoContrato: TipoContrato;
  estado: EstadoEmpleado;
  fechaIngreso: string | null;
  origenMicrosoft?: boolean;
  _count: {
    assignments: number;
    kitAssignments: number;
  };
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
  porBoleta: number;
  ubicacionesCount: number;
};

type UbicacionDetalle = {
  nombre: string;
  cantidad: number;
};

// Tipados contra el enum: si manana se agrega un estado y se olvida una
// etiqueta, el compilador lo detiene en vez de dejar la celda en blanco.
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
  contrato: "bg-blue-100 text-blue-800",
  boleta: "bg-purple-100 text-purple-800",
};

export default function EmpleadosPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoFilter, setEstadoFilter] = useState("");
  const [tipoContratoFilter, setTipoContratoFilter] = useState("");
  const [ubicacionFilter, setUbicacionFilter] = useState("");
  const [ubicaciones, setUbicaciones] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({
    totalEmpleados: 0,
    activos: 0,
    porBoleta: 0,
    ubicacionesCount: 0,
  });
  const [showUbicacionesModal, setShowUbicacionesModal] = useState(false);
  const [ubicacionesDetalle, setUbicacionesDetalle] = useState<UbicacionDetalle[]>([]);

  useEffect(() => {
    fetchEmployees();
  }, [pagination.page, estadoFilter, tipoContratoFilter, ubicacionFilter]);

  useEffect(() => {
    fetchUbicaciones();
    fetchStats();
  }, []);

  async function fetchUbicaciones() {
    try {
      // Obtener ubicaciones únicas haciendo múltiples requests si es necesario
      // El límite máximo de la API es 100
      const res = await fetch("/api/empleados?limit=100");
      const data = await res.json();

      if (!res.ok || !data.data) {
        console.error("Error fetching ubicaciones:", data.error);
        return;
      }

      const allEmployees: Employee[] = [...data.data];
      const totalPages = data.pagination?.totalPages || 1;

      // Si hay más páginas, obtenerlas
      if (totalPages > 1) {
        const promises = [];
        for (let page = 2; page <= Math.min(totalPages, 10); page++) {
          promises.push(fetch(`/api/empleados?limit=100&page=${page}`).then(r => r.json()));
        }
        const results = await Promise.all(promises);
        results.forEach(result => {
          if (result.data) {
            allEmployees.push(...result.data);
          }
        });
      }

      const uniqueUbicaciones = [...new Set(
        allEmployees
          .filter((e: Employee) => e.ubicacion)
          .map((e: Employee) => e.ubicacion)
      )] as string[];
      setUbicaciones(uniqueUbicaciones);

      // Calcular detalle de ubicaciones con conteo
      const ubicacionesMap = new Map<string, number>();
      allEmployees.forEach((e: Employee) => {
        if (e.ubicacion) {
          ubicacionesMap.set(e.ubicacion, (ubicacionesMap.get(e.ubicacion) || 0) + 1);
        }
      });

      const detalle = Array.from(ubicacionesMap.entries())
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad);

      setUbicacionesDetalle(detalle);
    } catch (error) {
      console.error("Error fetching ubicaciones:", error);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch("/api/empleados?limit=100");
      const data = await res.json();

      if (!res.ok || !data.data) {
        console.error("Error fetching stats:", data.error);
        return;
      }

      const allEmployees: Employee[] = [...data.data];
      const totalPages = data.pagination?.totalPages || 1;

      // Si hay más páginas, obtenerlas para cálculos precisos
      if (totalPages > 1) {
        const promises = [];
        for (let page = 2; page <= Math.min(totalPages, 10); page++) {
          promises.push(fetch(`/api/empleados?limit=100&page=${page}`).then(r => r.json()));
        }
        const results = await Promise.all(promises);
        results.forEach(result => {
          if (result.data) {
            allEmployees.push(...result.data);
          }
        });
      }

      // Calcular estadísticas reales
      const activos = allEmployees.filter((e: Employee) => e.estado === "activo").length;
      const porBoleta = allEmployees.filter((e: Employee) => e.tipoContrato === "boleta").length;
      const ubicacionesUnicas = new Set(
        allEmployees.filter((e: Employee) => e.ubicacion).map((e: Employee) => e.ubicacion)
      );

      setStats({
        totalEmpleados: data.pagination?.total || 0,
        activos,
        porBoleta,
        ubicacionesCount: ubicacionesUnicas.size,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }

  async function fetchEmployees() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (search) params.append("search", search);
      if (estadoFilter) params.append("estado", estadoFilter);
      if (tipoContratoFilter) params.append("tipoContrato", tipoContratoFilter);
      if (ubicacionFilter) params.append("ubicacion", ubicacionFilter);

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

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchEmployees();
  }

  function handleStatClick(filterType: "activo" | "boleta" | "reset") {
    if (filterType === "reset") {
      // Limpiar todos los filtros
      setEstadoFilter("");
      setTipoContratoFilter("");
      setUbicacionFilter("");
      setSearch("");
      setPagination((prev) => ({ ...prev, page: 1 }));
    } else if (filterType === "activo") {
      // Toggle filtro de activos
      if (estadoFilter === "activo") {
        setEstadoFilter("");
      } else {
        setEstadoFilter("activo");
      }
      setPagination((prev) => ({ ...prev, page: 1 }));
    } else if (filterType === "boleta") {
      // Toggle filtro de boleta
      if (tipoContratoFilter === "boleta") {
        setTipoContratoFilter("");
      } else {
        setTipoContratoFilter("boleta");
      }
      setPagination((prev) => ({ ...prev, page: 1 }));
    }
  }

  const hasActiveFilters = estadoFilter || tipoContratoFilter || ubicacionFilter || search;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Empleados</h1>
          <p className="text-gray-600">Gestión de colaboradores y asignaciones</p>
        </div>
        <div className="flex gap-2">
          <Can recurso="empleados">
            <Link
              href="/empleados/importar"
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Upload size={20} />
              <span>Importar Excel</span>
            </Link>
            <Link
              href="/empleados/nuevo"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>Nuevo Empleado</span>
            </Link>
          </Can>
        </div>
      </div>

      {/* Stats - Interactive Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Total Empleados - Reset Filter */}
        <button
          onClick={() => handleStatClick("reset")}
          disabled={!hasActiveFilters}
          className={cn(
            "bg-white rounded-lg shadow p-4 text-left transition-all",
            hasActiveFilters
              ? "hover:shadow-md hover:scale-105 cursor-pointer"
              : "opacity-75",
            !hasActiveFilters && "ring-2 ring-blue-500 ring-offset-2"
          )}
          aria-label="Ver todos los empleados - limpiar filtros"
          title={hasActiveFilters ? "Click para limpiar filtros" : "Mostrando todos"}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Users className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Empleados</p>
              <p className="text-xl font-bold">{stats.totalEmpleados}</p>
            </div>
          </div>
          {!hasActiveFilters && (
            <p className="text-xs text-blue-600 mt-2 font-medium">Sin filtros activos</p>
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

        {/* Por Boleta - Filter Toggle */}
        <button
          onClick={() => handleStatClick("boleta")}
          className={cn(
            "bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md hover:scale-105 cursor-pointer",
            tipoContratoFilter === "boleta" && "ring-2 ring-purple-500 ring-offset-2"
          )}
          aria-label="Filtrar empleados por boleta"
          aria-pressed={tipoContratoFilter === "boleta"}
          title="Click para filtrar por contrato a boleta"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-lg">
              <Building className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Por Boleta</p>
              <p className="text-xl font-bold">{stats.porBoleta}</p>
            </div>
          </div>
          {tipoContratoFilter === "boleta" && (
            <p className="text-xs text-purple-600 mt-2 font-medium">Filtro activo</p>
          )}
        </button>

        {/* Ubicaciones - Open Modal */}
        <button
          onClick={() => setShowUbicacionesModal(true)}
          className="bg-white rounded-lg shadow p-4 text-left transition-all hover:shadow-md hover:scale-105 cursor-pointer"
          aria-label="Ver desglose de ubicaciones"
          title="Click para ver detalle de ubicaciones"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <MapPin className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Ubicaciones</p>
              <p className="text-xl font-bold">{stats.ubicacionesCount}</p>
            </div>
          </div>
          <p className="text-xs text-orange-600 mt-2 font-medium">Click para ver detalle</p>
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por RUT, nombre, correo, cargo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={estadoFilter}
              onChange={(e) => {
                setEstadoFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los estados</option>
              {Object.entries(estadoLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={tipoContratoFilter}
              onChange={(e) => {
                setTipoContratoFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos los contratos</option>
              {Object.entries(tipoContratoLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={ubicacionFilter}
              onChange={(e) => {
                setUbicacionFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todas las ubicaciones</option>
              {ubicaciones.map((ubi) => (
                <option key={ubi} value={ubi}>
                  {ubi}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <Filter size={20} />
            </button>
          </div>
        </form>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  RUT
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Correo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cargo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Contrato
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Equipos
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
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
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {employee.nombres} {employee.apellidoPaterno}
                          {employee.origenMicrosoft && (
                            <span className="ml-1.5 inline-flex items-center text-[10px] bg-sky-100 text-sky-700 px-1.5 py-0.5 rounded font-normal">
                              Microsoft
                            </span>
                          )}
                        </p>
                        {employee.ubicacion && (
                          <p className="text-xs text-gray-500 flex items-center gap-1">
                            <MapPin size={12} />
                            {employee.ubicacion}
                          </p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-600">{employee.correoPersonal}</p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm text-gray-900">
                          {employee.cargo || "-"}
                        </p>
                        {employee.jefatura && (
                          <p className="text-xs text-gray-500">
                            Jefe: {employee.jefatura}
                          </p>
                        )}
                      </div>
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
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
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

      {/* Modal de Ubicaciones */}
      {showUbicacionesModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowUbicacionesModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <MapPin className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <h2 id="modal-title" className="text-lg font-bold text-gray-900">
                    Desglose de Ubicaciones
                  </h2>
                  <p className="text-sm text-gray-500">
                    {stats.ubicacionesCount} ubicaciones con {stats.totalEmpleados} empleados
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUbicacionesModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto max-h-[calc(80vh-120px)]">
              {ubicacionesDetalle.length === 0 ? (
                <p className="text-center text-gray-500 py-8">
                  No hay ubicaciones registradas
                </p>
              ) : (
                <div className="space-y-3">
                  {ubicacionesDetalle.map((ubicacion, index) => (
                    <button
                      key={ubicacion.nombre}
                      onClick={() => {
                        setUbicacionFilter(ubicacion.nombre);
                        setShowUbicacionesModal(false);
                        setPagination((prev) => ({ ...prev, page: 1 }));
                      }}
                      className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-orange-50 rounded-lg transition-colors group"
                      aria-label={`Filtrar por ubicación ${ubicacion.nombre} - ${ubicacion.cantidad} empleados`}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div className="flex items-center justify-center w-8 h-8 bg-orange-100 text-orange-600 rounded-full text-sm font-bold">
                          {index + 1}
                        </div>
                        <div className="text-left">
                          <p className="font-medium text-gray-900 group-hover:text-orange-600 transition-colors">
                            {ubicacion.nombre}
                          </p>
                          <p className="text-sm text-gray-500">
                            {ubicacion.cantidad} empleado{ubicacion.cantidad !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="bg-white px-3 py-1 rounded-full border border-gray-200">
                          <span className="text-sm font-bold text-gray-900">
                            {ubicacion.cantidad}
                          </span>
                        </div>
                        <div className="w-24 bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-orange-500 h-full transition-all"
                            style={{
                              width: `${(ubicacion.cantidad / stats.totalEmpleados) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs text-gray-500 w-12 text-right">
                          {((ubicacion.cantidad / stats.totalEmpleados) * 100).toFixed(1)}%
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t bg-gray-50">
              <p className="text-sm text-gray-600">
                Click en cualquier ubicación para filtrar la tabla
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
