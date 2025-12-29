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
  UserMinus,
  Clock,
  CheckCircle,
  AlertTriangle,
  Bell,
  BellOff,
  Laptop,
  Smartphone,
  Monitor,
  Package,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    categoria: {
      nombre: string;
    };
  };
};

type Employee = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correo: string;
  cargo: string | null;
  ubicacion: string | null;
  assignments: Assignment[];
};

type Termination = {
  id: string;
  fechaDesvinculacion: string;
  fechaDevolucionEquipos: string | null;
  estadoNotebook: string;
  estadoCelular: string;
  estadoMonitor: string;
  estadoKit: string;
  recibidoPor: string | null;
  lugarDevolucion: string | null;
  requiereDescuento: boolean;
  montoDescuento: number | null;
  notificadoRrhh: boolean;
  employee: Employee;
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const estadoLabels: Record<string, string> = {
  ok: "OK",
  danado: "Dañado",
  no_aplica: "N/A",
  pendiente: "Pendiente",
};

const estadoColors: Record<string, string> = {
  ok: "bg-green-100 text-green-800",
  danado: "bg-red-100 text-red-800",
  no_aplica: "bg-gray-100 text-gray-500",
  pendiente: "bg-orange-100 text-orange-800",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("es-CL");
}

function formatCurrency(amount: number | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(amount);
}

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

function hasPendingReturns(termination: Termination): boolean {
  return (
    termination.estadoNotebook === "pendiente" ||
    termination.estadoCelular === "pendiente" ||
    termination.estadoMonitor === "pendiente" ||
    termination.estadoKit === "pendiente"
  );
}

export default function DesvinculacionesPage() {
  const [terminations, setTerminations] = useState<Termination[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterPendientes, setFilterPendientes] = useState<string>("all");
  const [filterNotificado, setFilterNotificado] = useState<string>("all");

  useEffect(() => {
    fetchTerminations();
  }, [pagination.page, filterPendientes, filterNotificado]);

  async function fetchTerminations() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page.toString(),
        limit: pagination.limit.toString(),
      });
      if (search) params.append("search", search);
      if (filterPendientes !== "all") params.append("pendientes", filterPendientes);
      if (filterNotificado !== "all") params.append("notificadoRrhh", filterNotificado);

      const res = await fetch(`/api/desvinculaciones?${params}`);
      const data = await res.json();
      setTerminations(data.data || []);
      setPagination(data.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
    } catch (error) {
      console.error("Error fetching terminations:", error);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setPagination((prev) => ({ ...prev, page: 1 }));
    fetchTerminations();
  }

  // Contar pendientes y notificados
  const pendingCount = terminations.filter((t) => hasPendingReturns(t)).length;
  const notifiedCount = terminations.filter((t) => t.notificadoRrhh).length;
  const withDiscountCount = terminations.filter((t) => t.requiereDescuento).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Desvinculaciones</h1>
          <p className="text-gray-600">Gestión de devolución de equipos por desvinculación</p>
        </div>
        <Link
          href="/desvinculaciones/nueva"
          className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          <Plus size={20} />
          <span>Nueva Desvinculación</span>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <UserMinus className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Desvinculaciones</p>
              <p className="text-xl font-bold">{pagination.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Clock className="h-6 w-6 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pendientes Devolución</p>
              <p className="text-xl font-bold">{pendingCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-100 rounded-lg">
              <Bell className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Notificados RRHH</p>
              <p className="text-xl font-bold">{notifiedCount}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-yellow-100 rounded-lg">
              <AlertTriangle className="h-6 w-6 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Con Descuento</p>
              <p className="text-xl font-bold">{withDiscountCount}</p>
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
              placeholder="Buscar por RUT o nombre del empleado..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={filterPendientes}
              onChange={(e) => {
                setFilterPendientes(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="all">Todas</option>
              <option value="true">Pendientes</option>
              <option value="false">Completadas</option>
            </select>
            <select
              value={filterNotificado}
              onChange={(e) => {
                setFilterNotificado(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500"
            >
              <option value="all">Notificación</option>
              <option value="true">Notificado</option>
              <option value="false">Sin notificar</option>
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
                  Fecha Desvinculación
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Equipos
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Estados Devolución
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Descuento
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  RRHH
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
              ) : terminations.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                    No se encontraron desvinculaciones
                  </td>
                </tr>
              ) : (
                terminations.map((termination) => (
                  <tr key={termination.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {termination.employee.nombres} {termination.employee.apellidoPaterno}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">
                          {termination.employee.rut}
                        </p>
                        {termination.employee.cargo && (
                          <p className="text-xs text-gray-400">{termination.employee.cargo}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-sm text-gray-900">
                        {formatDate(termination.fechaDesvinculacion)}
                      </p>
                      {termination.fechaDevolucionEquipos && (
                        <p className="text-xs text-gray-500">
                          Dev: {formatDate(termination.fechaDevolucionEquipos)}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap gap-1">
                        {termination.employee.assignments.map((a) => (
                          <span
                            key={a.id}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                            title={`${a.asset.marca} ${a.asset.modelo}`}
                          >
                            {getCategoryIcon(a.asset.categoria.nombre)}
                            {a.asset.categoria.nombre}
                          </span>
                        ))}
                        {termination.employee.assignments.length === 0 && (
                          <span className="text-xs text-gray-400">Sin equipos</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-wrap justify-center gap-1">
                        {termination.estadoNotebook !== "no_aplica" && (
                          <span
                            className={cn(
                              "px-2 py-0.5 text-xs font-medium rounded",
                              estadoColors[termination.estadoNotebook]
                            )}
                            title="Notebook"
                          >
                            NB: {estadoLabels[termination.estadoNotebook]}
                          </span>
                        )}
                        {termination.estadoCelular !== "no_aplica" && (
                          <span
                            className={cn(
                              "px-2 py-0.5 text-xs font-medium rounded",
                              estadoColors[termination.estadoCelular]
                            )}
                            title="Celular"
                          >
                            Cel: {estadoLabels[termination.estadoCelular]}
                          </span>
                        )}
                        {termination.estadoMonitor !== "no_aplica" && (
                          <span
                            className={cn(
                              "px-2 py-0.5 text-xs font-medium rounded",
                              estadoColors[termination.estadoMonitor]
                            )}
                            title="Monitor"
                          >
                            Mon: {estadoLabels[termination.estadoMonitor]}
                          </span>
                        )}
                        <span
                          className={cn(
                            "px-2 py-0.5 text-xs font-medium rounded",
                            estadoColors[termination.estadoKit]
                          )}
                          title="Kit"
                        >
                          Kit: {estadoLabels[termination.estadoKit]}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {termination.requiereDescuento ? (
                        <div>
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-800">
                            Si
                          </span>
                          {termination.montoDescuento && (
                            <p className="text-xs text-red-600 mt-1">
                              {formatCurrency(termination.montoDescuento)}
                            </p>
                          )}
                        </div>
                      ) : (
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          No
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {termination.notificadoRrhh ? (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                          <Bell size={12} />
                          Notificado
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-600">
                          <BellOff size={12} />
                          Pendiente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={`/desvinculaciones/${termination.id}`}
                          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Ver detalle"
                        >
                          <Eye size={18} />
                        </Link>
                        <a
                          href={`/api/desvinculaciones/${termination.id}/reporte-rrhh`}
                          className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                          title="Descargar Reporte RRHH"
                          target="_blank"
                        >
                          <FileText size={18} />
                        </a>
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
              {pagination.total} desvinculaciones
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
