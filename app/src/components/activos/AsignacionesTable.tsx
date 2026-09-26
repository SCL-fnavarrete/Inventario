"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { formatearFecha } from "@/lib/utils/fechas";
import { identificadorActivo } from "@/lib/utils/identificador";

type Assignment = {
  id: string;
  fechaEntrega: string | null;
  fechaDevolucion: string | null;
  lugarEntrega: string | null;
  tipoMovimiento: string;
  activo: boolean;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    categoria: { nombre: string };
  };
  employee: {
    id: string;
    rut: string;
    nombres: string;
    apellidoPaterno: string;
  };
};

type Pagination = { page: number; limit: number; total: number; totalPages: number };

/**
 * Tabla de asignaciones vigentes, embebida al fondo del modulo de Activos.
 * El detalle (`/asignaciones/[id]`) sigue siendo una pagina propia; esta
 * tabla solo linkea a el.
 *
 * No incluye una accion para registrar devoluciones: una devolucion ocurre
 * dentro de un proceso que la justifica (desvinculacion, cambio de equipo)
 * y queda registrada ahi con su motivo y trazabilidad.
 */
export function AsignacionesTable() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // Version debounced del input; evita disparar una peticion por tecla.
  const debouncedSearch = useDebouncedValue(search, 350);
  // Elegir una sede en el selector del nav filtra tambien esta tabla.
  const { sedeSeleccionada } = useSedeSeleccionada();

  useEffect(() => {
    let cancelado = false;
    async function cargar() {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(pagination.page),
          limit: String(pagination.limit),
          activo: "true",
        });
        if (debouncedSearch) params.append("search", debouncedSearch);
        if (sedeSeleccionada) params.append("sedeId", sedeSeleccionada);
        const res = await fetch(`/api/asignaciones?${params}`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelado) return;
        setAssignments(data.data || []);
        setPagination(data.pagination);
      } catch {
        if (!cancelado) setAssignments([]);
      } finally {
        if (!cancelado) setLoading(false);
      }
    }
    cargar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, debouncedSearch, sedeSeleccionada]);

  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div>
            <h2 className="text-lg font-semibold text-fg">Asignaciones</h2>
            <p className="text-sm text-fg-subtle">Equipos entregados a empleados actualmente</p>
          </div>
          <div className="relative flex-1 max-w-sm sm:ml-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
            <input
              type="text"
              placeholder="Buscar por RUT, nombre o equipo..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPagination((prev) => ({ ...prev, page: 1 }));
              }}
              className="field-input pl-9 pr-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-surface-muted border-b">
            <tr>
              <th className="table-th">Empleado</th>
              <th className="table-th">Equipo</th>
              <th className="table-th">Entrega</th>
              <th className="table-th text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {loading ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-fg-subtle">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            ) : assignments.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-10 text-center text-fg-subtle">
                  No hay asignaciones vigentes
                </td>
              </tr>
            ) : (
              assignments.map((a) => (
                <tr key={a.id} className="hover:bg-surface-muted">
                  <td className="px-6 py-3 whitespace-nowrap">
                    <p className="text-sm font-medium text-fg">
                      {a.employee.nombres} {a.employee.apellidoPaterno}
                    </p>
                    <p className="text-xs text-fg-subtle font-mono">{a.employee.rut}</p>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-fg-subtle"><CategoryIcon categoria={a.asset.categoria.nombre} className="h-4 w-4" /></span>
                      <div>
                        <p className="text-sm font-medium text-fg">
                          {a.asset.marca} {a.asset.modelo}
                        </p>
                        <p className="text-xs text-fg-subtle font-mono">{identificadorActivo(a.asset, "-")}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-fg">
                    {formatearFecha(a.fechaEntrega, {}, "-")}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/asignaciones/${a.id}`}
                        className="p-2 text-fg-subtle hover:text-primary-700 hover:bg-primary-50 rounded-lg"
                        title="Ver detalle"
                      >
                        <Eye size={16} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <p className="text-sm text-fg-subtle">
            {pagination.total} asignacion{pagination.total === 1 ? "" : "es"}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="p-2 rounded-lg border border-line-strong hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Página anterior"
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: Math.min(pagination.totalPages, 7) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 7) pageNum = i + 1;
              else if (pagination.page <= 4) pageNum = i + 1;
              else if (pagination.page >= pagination.totalPages - 3) pageNum = pagination.totalPages - 6 + i;
              else pageNum = pagination.page - 3 + i;
              const isCurrent = pageNum === pagination.page;
              return (
                <button
                  key={pageNum}
                  onClick={() => setPagination((prev) => ({ ...prev, page: pageNum }))}
                  disabled={isCurrent}
                  className={cn(
                    "min-w-[36px] h-9 px-2 rounded-lg border text-sm font-medium",
                    isCurrent
                      ? "bg-brand text-white border-primary-700 cursor-default"
                      : "bg-surface text-fg-muted border-line-strong hover:bg-gray-100"
                  )}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
              disabled={pagination.page === pagination.totalPages}
              className="p-2 rounded-lg border border-line-strong hover:bg-surface-muted disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Página siguiente"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
