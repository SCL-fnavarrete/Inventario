"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import {
  Wrench,
  Plus,
  Search,
  Filter,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/auth/Can";
import { MantencionesTabs } from "@/components/mantenciones";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { formatearFecha } from "@/lib/utils/fechas";

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
  fechaRealizada: string | null;
  proximaMantencion: string | null;
  realizadoPor: string | null;
  costo: number | null;
  proveedorExterno: string | null;
  estado: string;
  resultado: string | null;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
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
  porEstado: { estado: string; count: number }[];
  porTipo: { tipoId: string; count: number }[];
  totalVencidas: number;
  totalProximas: number;
  totalEnProceso: number;
};

const estadoConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string; bgColor: string }> = {
  pendiente: { label: "Pendiente", icon: Clock, color: "text-orange-600", bgColor: "bg-orange-100" },
  en_proceso: { label: "En Proceso", icon: Wrench, color: "text-blue-600", bgColor: "bg-blue-100" },
  completada: { label: "Completada", icon: CheckCircle, color: "text-green-600", bgColor: "bg-green-100" },
  cancelada: { label: "Cancelada", icon: XCircle, color: "text-gray-600", bgColor: "bg-gray-100" },
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
  return formatearFecha(dateString);
}

function formatCurrency(amount: number | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(amount);
}

function isOverdue(fechaProgramada: string | null, estado: string): boolean {
  if (!fechaProgramada) return false;
  if (estado === "completada" || estado === "cancelada") return false;
  return new Date(fechaProgramada) < new Date();
}

export default function MantencionesPage() {
  const [maintenances, setMaintenances] = useState<Maintenance[]>([]);
  const [tiposMantencion, setTiposMantencion] = useState<TipoMantencion[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // El input responde a cada tecla; lo que dispara la busqueda es esta
  // version debounced -- antes buscaba en cada tecla sin ningun freno, una
  // peticion por letra. Ver useDebouncedValue y SPEC 2.14.
  const debouncedSearch = useDebouncedValue(search, 350);
  const [filterTipoId, setFilterTipoId] = useState("");
  const [filterEstado, setFilterEstado] = useState("");
  const [showVencidas, setShowVencidas] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  // Selector de sede del nav (Etapa 2): elegir una sede ahi filtra tambien
  // esta pantalla, igual que ya pasa en Activos.
  const { sedeSeleccionada } = useSedeSeleccionada();

  useEffect(() => {
    fetchTipos();
  }, []);

  useEffect(() => {
    fetchMaintenances();
    fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filterTipoId, filterEstado, showVencidas, page, sedeSeleccionada]);

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

      const res = await fetch(`/api/mantenciones?${params}`);
      const data = await res.json();

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
      const res = await fetch("/api/mantenciones/pendientes?dias=30");
      const data = await res.json();
      setStats(data.stats);
    } catch (error) {
      console.error("Error fetching stats:", error);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Mantenciones</h1>
          <p className="text-gray-600">Gestión de mantenciones preventivas y correctivas</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/mantenciones/calendario"
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            <CalendarDays size={20} />
            Calendario
          </Link>
          <Can recurso="mantenciones">
            <Link
              href="/mantenciones/programar"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus size={20} />
              Programar Mantención
            </Link>
          </Can>
        </div>
      </div>

      <MantencionesTabs />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Vencidas</p>
              <p className="text-2xl font-bold text-red-600">{stats?.totalVencidas || 0}</p>
            </div>
            <div className="p-3 bg-red-100 rounded-full">
              <AlertTriangle className="h-6 w-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Próximas (30 días)</p>
              <p className="text-2xl font-bold text-orange-600">{stats?.totalProximas || 0}</p>
            </div>
            <div className="p-3 bg-orange-100 rounded-full">
              <Calendar className="h-6 w-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">En Proceso</p>
              <p className="text-2xl font-bold text-blue-600">{stats?.totalEnProceso || 0}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Wrench className="h-6 w-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Completadas (mes)</p>
              <p className="text-2xl font-bold text-green-600">
                {stats?.porEstado.find((s) => s.estado === "completada")?.count || 0}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por descripción, activo, técnico..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <select
            value={filterTipoId}
            onChange={(e) => {
              setFilterTipoId(e.target.value);
              setPage(1);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los estados</option>
            <option value="pendiente">Pendiente</option>
            <option value="en_proceso">En Proceso</option>
            <option value="completada">Completada</option>
            <option value="cancelada">Cancelada</option>
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
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
            )}
          >
            <AlertTriangle size={20} />
            Vencidas
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : maintenances.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Wrench className="h-12 w-12 mb-4 text-gray-300" />
            <p>No se encontraron mantenciones</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Activo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Tipo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Descripción
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Fecha Programada
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Estado
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      Técnico
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {maintenances.map((maintenance) => {
                    const config = estadoConfig[maintenance.estado] || estadoConfig.pendiente;
                    const overdue = isOverdue(maintenance.fechaProgramada, maintenance.estado);
                    const StatusIcon = config.icon;

                    return (
                      <tr key={maintenance.id} className={cn("hover:bg-gray-50", overdue && "bg-red-50")}>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-3">
                            <span className="text-gray-400">
                              {getCategoryIcon(maintenance.asset.categoria.nombre)}
                            </span>
                            <div>
                              <p className="font-medium text-sm">
                                {maintenance.asset.marca} {maintenance.asset.modelo}
                              </p>
                              <p className="text-xs text-gray-500">
                                {maintenance.asset.numeroSerie || "Sin serie"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                            {maintenance.tipo.nombre}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm text-gray-900 line-clamp-2 max-w-xs">
                            {maintenance.descripcion}
                          </p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            {overdue && <AlertTriangle className="h-4 w-4 text-red-500" />}
                            <span className={cn("text-sm", overdue && "text-red-600 font-medium")}>
                              {formatDate(maintenance.fechaProgramada)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full",
                              config.bgColor,
                              config.color
                            )}
                          >
                            <StatusIcon className="h-3 w-3" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500">
                          {maintenance.realizadoPor || "-"}
                        </td>
                        <td className="px-4 py-4 text-right">
                          <Link
                            href={`/mantenciones/${maintenance.id}`}
                            className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                          >
                            Ver detalle
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Página {page} de {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={20} />
                </button>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
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
