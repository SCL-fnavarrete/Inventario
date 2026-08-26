"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  ArrowLeftRight,
  Undo2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  CheckCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/auth/Can";

type Assignment = {
  id: string;
  fechaEntrega: string;
  fechaDevolucion: string | null;
  lugarEntrega: string | null;
  entregadoPor: string | null;
  tipoMovimiento: string;
  activo: boolean;
  estadoDevolucion: string | null;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    categoria: {
      nombre: string;
    };
  };
  employee: {
    id: string;
    rut: string;
    nombres: string;
    apellidoPaterno: string;
  };
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const tipoMovimientoLabels: Record<string, string> = {
  ingreso: "Ingreso",
  cambio: "Cambio",
  reemplazo: "Reemplazo",
  temporal: "Temporal",
};

const tipoMovimientoColors: Record<string, string> = {
  ingreso: "bg-green-100 text-green-800",
  cambio: "bg-blue-100 text-blue-800",
  reemplazo: "bg-purple-100 text-purple-800",
  temporal: "bg-orange-100 text-orange-800",
};

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-4 w-4" />;
    case "celular":
      return <Smartphone className="h-4 w-4" />;
    case "monitor":
      return <Monitor className="h-4 w-4" />;
    default:
      return <Package className="h-4 w-4" />;
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("es-CL");
}

export default function AsignacionesPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showActive, setShowActive] = useState<string>("all");
  const [tipoFilter, setTipoFilter] = useState("");

  useEffect(() => {
    fetchAssignments();
  }, [pagination.page, showActive, tipoFilter]);

  async function fetchAssignments() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (search) params.append("search", search);
      if (showActive !== "all") params.append("activo", showActive);
      if (tipoFilter) params.append("tipoMovimiento", tipoFilter);

      const res = await fetch(`/api/asignaciones?${params}`);
      const data = await res.json();
      setAssignments(data.data);
      setPagination(data.pagination);
    } catch (error) {
      console.error("Error fetching assignments:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchAssignments();
  }

  // Contar asignaciones activas y devueltas
  const activeCount = assignments.filter((a) => a.activo).length;
  const returnedCount = assignments.filter((a) => !a.activo).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Asignaciones</h1>
          <p className="text-gray-600">Gestión de entregas y devoluciones de equipos</p>
        </div>
        <div className="flex gap-2">
          <Can recurso="asignaciones">
            <Link
              href="/asignaciones/devolucion"
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
            >
              <Undo2 size={20} />
              <span>Registrar Devolución</span>
            </Link>
          </Can>
          <Can recurso="solicitudes">
            <Link
              href="/solicitudes/nueva"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={20} />
              <span>Nueva Solicitud</span>
            </Link>
          </Can>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <ArrowLeftRight className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Asignaciones</p>
              <p className="text-xl font-bold">{pagination.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Clock className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Activas</p>
              <p className="text-xl font-bold">{activeCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <CheckCircle className="h-6 w-6 text-gray-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Devueltas</p>
              <p className="text-xl font-bold">{returnedCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por RUT, nombre, serie de equipo..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={showActive}
              onChange={(e) => {
                setShowActive(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Todas</option>
              <option value="true">Activas</option>
              <option value="false">Devueltas</option>
            </select>
            <select
              value={tipoFilter}
              onChange={(e) => {
                setTipoFilter(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los tipos</option>
              {Object.entries(tipoMovimientoLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
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
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Empleado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Equipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha Entrega
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha Devolución
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    Cargando...
                  </td>
                </tr>
              ) : assignments.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron asignaciones
                  </td>
                </tr>
              ) : (
                assignments.map((assignment) => (
                  <tr key={assignment.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {assignment.employee.nombres} {assignment.employee.apellidoPaterno}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                          {assignment.employee.rut}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400">
                          {getCategoryIcon(assignment.asset.categoria.nombre)}
                        </span>
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {assignment.asset.marca} {assignment.asset.modelo}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">
                            {assignment.asset.numeroSerie || "-"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={cn(
                          "px-2 py-1 text-xs font-medium rounded-full",
                          tipoMovimientoColors[assignment.tipoMovimiento]
                        )}
                      >
                        {tipoMovimientoLabels[assignment.tipoMovimiento]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">
                        {formatDate(assignment.fechaEntrega)}
                      </p>
                      {assignment.lugarEntrega && (
                        <p className="text-xs text-gray-500">{assignment.lugarEntrega}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {assignment.fechaDevolucion ? (
                        <p className="text-sm text-gray-900">
                          {formatDate(assignment.fechaDevolucion)}
                        </p>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {assignment.activo ? (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          Activa
                        </span>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                          Devuelta
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/asignaciones/${assignment.id}`}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Ver detalle"
                        >
                          <Eye size={18} />
                        </Link>
                        <a
                          href={`/api/asignaciones/${assignment.id}/acta?tipo=${assignment.activo ? "entrega" : "devolucion"}`}
                          className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                          title="Descargar Acta"
                          target="_blank"
                        >
                          <FileText size={18} />
                        </a>
                        {assignment.activo && (
                          <Link
                            href={`/asignaciones/devolucion?id=${assignment.id}`}
                            className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
                            title="Registrar devolución"
                          >
                            <Undo2 size={18} />
                          </Link>
                        )}
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
              {pagination.total} asignaciones
            </p>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                }
                disabled={pagination.page === 1}
                className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                }
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg border hover:bg-gray-50 disabled:opacity-50"
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
