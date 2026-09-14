'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  Notebook,
  ClipboardList,
  LayoutGrid,
  List,
  FileText,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Can } from "@/components/auth/Can";
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";

type WorkflowRequest = {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  observaciones: string | null;
  createdAt: string;
  fechaCierre: string | null;
  employee: {
    id: string;
    rut: string | null;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    cargo: string | null;
  };
  solicitante: { id: string; nombre: string; rol: string };
  responsableActual: { id: string; nombre: string; rol: string } | null;
  _count: { comments: number; pendientes: number };
};

type Pagination = {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

const tipoLabels: Record<string, string> = {
  onboarding: 'Onboarding',
  cambio_equipo: 'Cambio de Equipo',
  offboarding: 'Offboarding',
};

const tipoColors: Record<string, string> = {
  onboarding: 'bg-green-100 text-green-800',
  cambio_equipo: 'bg-blue-100 text-blue-800',
  offboarding: 'bg-orange-100 text-orange-800',
};

const estadoLabels: Record<string, string> = {
  solicitud_recibida: 'Solicitud Recibida',
  gestion_ti: 'Gestión TI',
  coordinando_entrega: 'Coordinando Entrega',
  equipos_entregados: 'Equipos Entregados',
  registro_rrhh: 'Ticket Cerrado',
  incidencia_detectada: 'Incidencia Detectada',
  cambio_ejecutado: 'Cambio Ejecutado',
  confirmacion_rrhh: 'Ticket Cerrado',
  solicitud_emitida: 'Solicitud Emitida',
  coordinacion_en_curso: 'Coordinación en Curso',
  equipo_recibido: 'Equipo Recibido',
  consolidacion_cierre: 'Consolidación y Cierre',
};



export default function SolicitudesPage() {
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // El input responde a cada tecla; lo que dispara la busqueda es esta
  // version debounced -- antes buscaba en cada tecla sin ningun freno, una
  // peticion por letra. Ver useDebouncedValue y SPEC 2.14.
  const debouncedSearch = useDebouncedValue(search, 350);
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
  // Selector de sede del nav (Etapa 2): elegir una sede ahi filtra tambien
  // esta pantalla, igual que ya pasa en Activos.
  const { sedeSeleccionada } = useSedeSeleccionada();

  const fetchRequests = useCallback(
    async (page = 1) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ page: String(page), limit: '10' });
        if (debouncedSearch) params.set('search', debouncedSearch);
        if (filterTipo) params.set('tipo', filterTipo);
        if (filterEstado) params.set('estado', filterEstado);
        if (sedeSeleccionada) params.set('sedeId', sedeSeleccionada);

        const res = await fetch(`/api/solicitudes?${params}`);
        const json = await res.json();
        setRequests(json.data || []);
        setPagination(json.pagination || { page: 1, limit: 10, total: 0, totalPages: 0 });
      } catch (error) {
        console.error('Error fetching requests:', error);
      } finally {
        setLoading(false);
      }
    },
    [debouncedSearch, filterTipo, filterEstado, sedeSeleccionada]
  );

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // El Kanban agrupa por tipo de solicitud (Onboarding / Cambio de Equipo /
  // Offboarding) en vez de por el estado interno detallado -- eso ahora vive
  // solo como badge dentro de cada tarjeta. Si hay un filtro de tipo activo
  // solo se muestra esa columna.
  const kanbanTipos = (filterTipo ? [filterTipo] : ['onboarding', 'cambio_equipo', 'offboarding']) as string[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Solicitudes</h1>
          <p className="text-gray-600">Gestión de solicitudes de equipos y workflows</p>
        </div>
        <Can recurso="solicitudes">
          <Link
            href="/solicitudes/nueva"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nueva Solicitud
          </Link>
        </Can>
      </div>

      {/* Search and Filters */}
      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número, empleado, RUT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors',
              showFilters
                ? 'bg-blue-50 border-blue-300 text-blue-700'
                : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            )}
          >
            <Filter className="h-4 w-4" />
            Filtros
          </button>
          <div className="flex border border-gray-300 rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('table')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'table' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'kanban'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:bg-gray-100'
              )}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-3 border-t">
            <select
              value={filterTipo}
              onChange={(e) => setFilterTipo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Todos los tipos</option>
              <option value="onboarding">Onboarding</option>
              <option value="cambio_equipo">Cambio de Equipo</option>
              <option value="offboarding">Offboarding</option>
            </select>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2"
            >
              <option value="">Todos los estados</option>
              <option value="abierto">Abierto</option>
              <option value="cerrado">Cerrado</option>
            </select>
            <button
              onClick={() => {
                setFilterTipo('');
                setFilterEstado('');
                setSearch('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Número
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tipo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Empleado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Responsable
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Fecha
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-blue-600">
                      <Link href={`/solicitudes/${req.id}`}>{req.numero}</Link>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex px-2 py-1 text-xs font-medium rounded-full',
                          tipoColors[req.tipo]
                        )}
                      >
                        {tipoLabels[req.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {req.employee.nombres} {req.employee.apellidoPaterno}
                      {req.employee.cargo && (
                        <span className="block text-xs text-gray-500">{req.employee.cargo}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex px-2 py-1 text-xs font-medium rounded-full',
                          req.fechaCierre
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-blue-100 text-blue-800'
                        )}
                      >
                        {req.fechaCierre ? 'Cerrado' : 'Abierto'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {req.responsableActual?.nombre || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">
                      {new Date(req.createdAt).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/solicitudes/${req.id}`}
                          className="text-blue-600 hover:text-blue-800"
                          title="Ver solicitud"
                        >
                          <Notebook className="h-4 w-4" />
                        </Link>
                        {/* Descarga directa de la plantilla del acta sin entrar
                            al detalle -- por ahora solo onboarding, que es el
                            unico tipo con la plantilla ya conectada a datos
                            reales (comprobante-entrega). Cambio de equipo y
                            offboarding quedan pendientes de extender. */}
                        {req.tipo === 'onboarding' && (
                          <a
                            href={`/api/solicitudes/${req.id}/documento/comprobante-entrega`}
                            className="text-gray-500 hover:text-gray-700"
                            title="Descargar plantilla de acta"
                          >
                            <FileText className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                      <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      No hay solicitudes registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 border-t flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Mostrando {(pagination.page - 1) * pagination.limit + 1} a{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} de{' '}
                {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchRequests(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <button
                  onClick={() => fetchRequests(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-2 border rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Kanban View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanTipos.map((tipo) => {
            const items = requests.filter((r) => r.tipo === tipo);
            return (
              <div key={tipo} className="flex-shrink-0 w-72">
                <div className="bg-gray-100 rounded-lg p-3">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">
                    {tipoLabels[tipo] || tipo}{' '}
                    <span className="text-gray-400">({items.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {items.map((req) => (
                      <Link
                        key={req.id}
                        href={`/solicitudes/${req.id}`}
                        className="block bg-white rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-medium text-blue-600">{req.numero}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {req.employee.nombres} {req.employee.apellidoPaterno}
                        </p>
                        <span className="inline-flex mt-1 px-1.5 py-0.5 text-xs rounded bg-indigo-100 text-indigo-800">
                          {estadoLabels[req.estado] || req.estado}
                        </span>
                      </Link>
                    ))}
                    {items.length === 0 && (
                      <p className="text-xs text-gray-400 text-center py-4">Sin solicitudes</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

