"use client";

import { useState, useEffect, Fragment } from "react";
import {
  History,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

// Pantalla nueva (SPEC 2.34, 14-sep-2026): unifica AuditLog + AssetHistory +
// WorkflowTransition en una sola linea de tiempo -- pedido explicito de
// Javier de tener "todo el historial del sistema en un solo lugar", sin
// sacar nada de las pestañas de historial que ya existen en el detalle de
// cada Activo y cada Solicitud (esas siguen exactamente igual). Ver
// /api/auditoria.

type EventoAuditoria = {
  id: string;
  fuente: "auditlog" | "asset_history" | "workflow_transition";
  moduloLabel: string;
  moduloValor: string;
  entidadId: string;
  accion: string;
  descripcion: string;
  usuario: string | null;
  datosAnteriores: unknown;
  datosNuevos: unknown;
  createdAt: string;
  contexto: string | null;
};

type Pagination = { page: number; limit: number; total: number; totalPages: number };

const MODULOS = [
  { value: "", label: "Todos los módulos" },
  { value: "activo", label: "Activo" },
  { value: "solicitud", label: "Solicitud" },
  { value: "empleado", label: "Empleado" },
  { value: "compra", label: "Compra" },
  { value: "usuario", label: "Usuario" },
  { value: "mantencion", label: "Mantención" },
  { value: "guia_despacho", label: "Guía de Despacho" },
  { value: "desvinculacion", label: "Desvinculación" },
  { value: "kit_item", label: "Kit/EPP" },
  { value: "sede", label: "Sede" },
  { value: "categoria", label: "Categoría" },
  { value: "tipo_mantencion", label: "Tipo de Mantención" },
  { value: "configuracion", label: "Configuración" },
];

const moduloColor: Record<string, string> = {
  activo: "bg-blue-100 text-blue-800",
  solicitud: "bg-purple-100 text-purple-800",
  empleado: "bg-green-100 text-green-800",
  compra: "bg-teal-100 text-teal-800",
  usuario: "bg-red-100 text-red-800",
  mantencion: "bg-orange-100 text-orange-800",
  guia_despacho: "bg-cyan-100 text-cyan-800",
  desvinculacion: "bg-rose-100 text-rose-800",
  kit_item: "bg-lime-100 text-lime-800",
  sede: "bg-amber-100 text-amber-800",
  categoria: "bg-indigo-100 text-indigo-800",
  tipo_mantencion: "bg-fuchsia-100 text-fuchsia-800",
  configuracion: "bg-slate-100 text-slate-800",
};

function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-CL");
}

export default function AuditoriaPage() {
  const [eventos, setEventos] = useState<EventoAuditoria[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [topeAlcanzado, setTopeAlcanzado] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);

  const [modulo, setModulo] = useState("");
  const [usuario, setUsuario] = useState("");
  const debouncedUsuario = useDebouncedValue(usuario, 350);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 350);
  const [fechaDesde, setFechaDesde] = useState("");
  const [fechaHasta, setFechaHasta] = useState("");

  useEffect(() => {
    fetchEventos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulo, debouncedUsuario, debouncedSearch, fechaDesde, fechaHasta, pagination.page]);

  async function fetchEventos() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(pagination.page),
        limit: String(pagination.limit),
      });
      if (modulo) params.append("modulo", modulo);
      if (debouncedUsuario) params.append("usuario", debouncedUsuario);
      if (debouncedSearch) params.append("search", debouncedSearch);
      if (fechaDesde) params.append("fechaDesde", fechaDesde);
      if (fechaHasta) params.append("fechaHasta", fechaHasta);

      const res = await fetch(`/api/auditoria?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      setEventos(data.data || []);
      setPagination(data.pagination);
      setTopeAlcanzado(!!data.topeAlcanzado);
    } catch (error) {
      console.error("Error fetching auditoria:", error);
    } finally {
      setLoading(false);
    }
  }

  function resetPagina() {
    setPagination((prev) => ({ ...prev, page: 1 }));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <History size={24} />
          Auditoría
        </h1>
        <p className="text-gray-600 mt-1">
          Historial completo del sistema: quién hizo qué y cuándo, en todos los módulos.
        </p>
      </div>

      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Módulo</label>
          <select
            value={modulo}
            onChange={(e) => {
              setModulo(e.target.value);
              resetPagina();
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {MODULOS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Usuario</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Email o nombre..."
              value={usuario}
              onChange={(e) => {
                setUsuario(e.target.value);
                resetPagina();
              }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="block text-xs font-medium text-gray-500 mb-1">Buscar en descripción</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                resetPagina();
              }}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
          <input
            type="date"
            value={fechaDesde}
            onChange={(e) => {
              setFechaDesde(e.target.value);
              resetPagina();
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
          <input
            type="date"
            value={fechaHasta}
            onChange={(e) => {
              setFechaHasta(e.target.value);
              resetPagina();
            }}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {topeAlcanzado && (
        <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg text-sm">
          <AlertTriangle size={16} className="shrink-0" />
          Hay más eventos de los que se muestran para este filtro -- acota el rango de fechas o el
          módulo para ver el listado completo.
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Módulo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    <Loader2 className="h-5 w-5 animate-spin inline" />
                  </td>
                </tr>
              ) : eventos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    No hay eventos para estos filtros
                  </td>
                </tr>
              ) : (
                eventos.map((ev) => {
                  const abierto = expandido === ev.id;
                  const tieneDetalle = ev.datosAnteriores || ev.datosNuevos;
                  return (
                    <Fragment key={ev.id}>
                      <tr className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {formatFecha(ev.createdAt)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={cn(
                              "px-2 py-1 text-xs font-medium rounded-full",
                              moduloColor[ev.moduloValor] || "bg-gray-100 text-gray-800"
                            )}
                          >
                            {ev.moduloLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">{ev.accion}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <p>{ev.descripcion}</p>
                          {ev.contexto && <p className="text-xs text-gray-500">{ev.contexto}</p>}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {ev.usuario || "-"}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-right">
                          {tieneDetalle && (
                            <button
                              onClick={() => setExpandido(abierto ? null : ev.id)}
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Ver datos anteriores/nuevos"
                            >
                              {abierto ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          )}
                        </td>
                      </tr>
                      {abierto && tieneDetalle && (
                        <tr>
                          <td colSpan={6} className="px-4 py-3 bg-gray-50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                              {ev.datosAnteriores != null && (
                                <div>
                                  <p className="font-medium text-gray-600 mb-1">Datos anteriores</p>
                                  <pre className="bg-white border border-gray-200 rounded-lg p-2 overflow-x-auto text-gray-700">
                                    {JSON.stringify(ev.datosAnteriores, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {ev.datosNuevos != null && (
                                <div>
                                  <p className="font-medium text-gray-600 mb-1">Datos nuevos</p>
                                  <pre className="bg-white border border-gray-200 rounded-lg p-2 overflow-x-auto text-gray-700">
                                    {JSON.stringify(ev.datosNuevos, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination.totalPages > 1 && (
          <div className="px-4 py-4 border-t flex items-center justify-between">
            <p className="text-sm text-gray-500">{pagination.total} eventos</p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Página anterior"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-gray-600 px-2">
                Página {pagination.page} de {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Página siguiente"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
