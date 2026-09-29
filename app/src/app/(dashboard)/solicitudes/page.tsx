'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Plus,
  Search,
  Filter,
  Notebook,
  ClipboardList,
  LayoutGrid,
  List,
  FileText,
} from 'lucide-react';
import { cn } from '@/shared/cn';
import { Can } from "@/shared/ui/Can";
import { useDebouncedValue } from '@/shared/hooks/useDebouncedValue';
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { Pagination } from "@/shared/ui/Pagination";
import { documentoDeSolicitud } from '@/modules/solicitudes';

type WorkflowRequest = {
  id: string;
  numero: string;
  tipo: string;
  estado: string;
  // Si la desvinculacion tiene Acta de Devolucion (lo calcula el servidor).
  tieneActa?: boolean;
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

type Paginacion = {
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
  cambio_equipo: 'bg-primary-100 text-primary-900',
  offboarding: 'bg-orange-100 text-orange-800',
};

const estadoLabels: Record<string, string> = {
  solicitud_recibida: 'Solicitud Recibida',
  gestion_ti: 'Gestión TI',
  equipos_entregados: 'Equipos Entregados',
  registro_rrhh: 'Ticket Cerrado',
  incidencia_detectada: 'Incidencia Detectada',
  cambio_ejecutado: 'Cambio Ejecutado',
  confirmacion_rrhh: 'Ticket Cerrado',
  solicitud_emitida: 'Solicitud Emitida',
  equipo_recibido: 'Equipo Recibido',
  consolidacion_cierre: 'Consolidación y Cierre',
};



export default function SolicitudesPage() {
  const [requests, setRequests] = useState<WorkflowRequest[]>([]);
  const [pagination, setPagination] = useState<Paginacion>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  // Debounced so the search fires once typing pauses, not on every keystroke.
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

  // Kanban groups by request type (not internal state, which is shown as
  // a badge per card). An active type filter shows only that column.
  const kanbanTipos = (filterTipo ? [filterTipo] : ['onboarding', 'cambio_equipo', 'offboarding']) as string[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        title="Solicitudes"
        description="Gestión de solicitudes de equipos y workflows"
        actions={
          <>
            <Can recurso="solicitudes">
              <Link
                href="/solicitudes/nueva"
                className={buttonClasses()}
              >
                <Plus className="h-4 w-4" />
                Nueva Solicitud
              </Link>
            </Can>
          </>
        }
      />

      {/* Search and Filters */}
      <div className="card p-4 space-y-4">
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
            <input
              type="text"
              placeholder="Buscar por número, empleado, RUT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="field-input pl-10 pr-4"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors',
              showFilters
                ? 'bg-primary-50 border-primary-300 text-primary-800'
                : 'border-line-strong text-fg-muted hover:bg-surface-muted'
            )}
          >
            <Filter className="h-4 w-4" />
            Filtros
          </button>
          <div className="flex border border-line-strong rounded-lg overflow-hidden">
            <button aria-label="Vista de tabla"
              onClick={() => setViewMode('table')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'table' ? 'bg-brand text-white' : 'text-fg-subtle hover:bg-gray-100'
              )}
            >
              <List className="h-4 w-4" />
            </button>
            <button aria-label="Vista de tarjetas"
              onClick={() => setViewMode('kanban')}
              className={cn(
                'p-2 transition-colors',
                viewMode === 'kanban'
                  ? 'bg-brand text-white'
                  : 'text-fg-subtle hover:bg-gray-100'
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
              className="border border-line-strong rounded-lg px-3 py-2"
            >
              <option value="">Todos los tipos</option>
              <option value="onboarding">Onboarding</option>
              <option value="cambio_equipo">Cambio de Equipo</option>
              <option value="offboarding">Offboarding</option>
            </select>
            <select
              value={filterEstado}
              onChange={(e) => setFilterEstado(e.target.value)}
              className="border border-line-strong rounded-lg px-3 py-2"
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
              className="text-sm text-fg-subtle hover:text-fg-muted"
            >
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700" />
        </div>
      ) : viewMode === 'table' ? (
        /* Table View */
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-muted">
                <tr>
                  <th className="table-th px-4">
                    Número
                  </th>
                  <th className="table-th px-4 hidden md:table-cell">
                    Tipo
                  </th>
                  <th className="table-th px-4">
                    Empleado
                  </th>
                  <th className="table-th px-4 hidden md:table-cell">
                    Estado
                  </th>
                  <th className="table-th px-4 hidden md:table-cell">
                    Responsable
                  </th>
                  <th className="table-th px-4 hidden md:table-cell">
                    Fecha
                  </th>
                  {/* En celular el numero ya abre el detalle, donde esta la descarga. */}
                  <th className="table-th px-4 hidden md:table-cell">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-line">
                {requests.map((req) => (
                  <tr key={req.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-3 text-sm font-medium text-primary-700 whitespace-nowrap">
                      <Link href={`/solicitudes/${req.id}`}>{req.numero}</Link>
                      {/* En celular el tipo va bajo el numero: una columna menos. */}
                      <span
                        className={cn(
                          'md:hidden mt-1 flex w-fit px-2 py-0.5 text-xs font-medium rounded-full',
                          tipoColors[req.tipo]
                        )}
                      >
                        {tipoLabels[req.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                        className={cn(
                          'inline-flex px-2 py-1 text-xs font-medium rounded-full',
                          tipoColors[req.tipo]
                        )}
                      >
                        {tipoLabels[req.tipo]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg wrap-anywhere">
                      {req.employee.nombres} {req.employee.apellidoPaterno}
                      {req.employee.cargo && (
                        <span className="block text-xs text-fg-subtle">{req.employee.cargo}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                        className={cn(
                          'inline-flex px-2 py-1 text-xs font-medium rounded-full',
                          req.fechaCierre
                            ? 'bg-gray-100 text-fg-muted'
                            : 'bg-primary-100 text-primary-900'
                        )}
                      >
                        {req.fechaCierre ? 'Cerrado' : 'Abierto'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted hidden md:table-cell">
                      {req.responsableActual?.nombre || '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-subtle hidden md:table-cell">
                      {new Date(req.createdAt).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/solicitudes/${req.id}`}
                          className="text-primary-700 hover:text-primary-900"
                          title="Ver solicitud"
                        >
                          <Notebook className="h-4 w-4" />
                        </Link>
                        {/* Direct download of the comprobante without opening
                            the detail view, available for all request types. */}
                        {(() => {
                          const doc = documentoDeSolicitud(req);
                          if (!doc) return null;
                          return (
                            <a
                              href={`/api/solicitudes/${req.id}/documento/${doc.tipo}`}
                              className="text-fg-subtle hover:text-fg-muted"
                              title={`Descargar ${doc.label}`}
                            >
                              <FileText className="h-4 w-4" />
                            </a>
                          );
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-fg-subtle">
                      <ClipboardList className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                      No hay solicitudes registradas
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            className="px-4 py-3 border-t border-line"
            current={pagination.page}
            pages={pagination.totalPages}
            total={pagination.total}
            limit={pagination.limit}
            itemLabel="solicitudes"
            onPageChange={(p) => fetchRequests(p)}
          />
        </div>
      ) : (
        /* Kanban View */
        <div className="flex gap-4 overflow-x-auto pb-4">
          {kanbanTipos.map((tipo) => {
            const items = requests.filter((r) => r.tipo === tipo);
            return (
              <div key={tipo} className="flex-shrink-0 w-72">
                <div className="bg-gray-100 rounded-lg p-3">
                  <h3 className="text-sm font-semibold text-fg-muted mb-3">
                    {tipoLabels[tipo] || tipo}{' '}
                    <span className="text-fg-subtle">({items.length})</span>
                  </h3>
                  <div className="space-y-2">
                    {items.map((req) => (
                      <Link
                        key={req.id}
                        href={`/solicitudes/${req.id}`}
                        className="block bg-surface rounded-lg shadow-sm p-3 hover:shadow-md transition-shadow"
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="text-xs font-medium text-primary-700">{req.numero}</span>
                        </div>
                        <p className="text-sm font-medium text-fg">
                          {req.employee.nombres} {req.employee.apellidoPaterno}
                        </p>
                        <span className="inline-flex mt-1 px-1.5 py-0.5 text-xs rounded bg-primary-100 text-primary-900">
                          {estadoLabels[req.estado] || req.estado}
                        </span>
                      </Link>
                    ))}
                    {items.length === 0 && (
                      <p className="text-xs text-fg-subtle text-center py-4">Sin solicitudes</p>
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

