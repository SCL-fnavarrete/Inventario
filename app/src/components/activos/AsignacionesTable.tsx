"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  Undo2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  Search,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";

type Assignment = {
  id: string;
  fechaEntrega: string;
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

function iconoCategoria(nombre: string) {
  switch (nombre.toLowerCase()) {
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

/**
 * Tabla de asignaciones vigentes, embebida al fondo del modulo de Activos --
 * reemplaza al modulo standalone "Asignaciones" (ver Sidebar), que se saco
 * de la navegacion porque duplicaba lo que ya vive aca (el formulario para
 * asignar un activo, AsignarActivoForm, ya vivia en Activos desde antes). El
 * detalle (`/asignaciones/[id]`) y el registro de devolucion
 * (`/asignaciones/devolucion`) se mantienen como paginas propias -- esta
 * tabla solo linkea a ellas, igual que hacia el listado viejo.
 */
export function AsignacionesTable() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, limit: 5, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  // El input responde a cada tecla (setSearch abajo), pero lo que dispara la
  // peticion es esta version debounced -- antes buscaba en cada tecla sin
  // ningun freno, una peticion por letra. Ver useDebouncedValue.
  const debouncedSearch = useDebouncedValue(search, 350);

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
  }, [pagination.page, debouncedSearch]);

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Asignaciones</h2>
          <p className="text-sm text-gray-500">Equipos entregados a empleados actualmente</p>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por RUT, nombre o equipo..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Empleado</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Equipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entrega</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-400">
                  <Loader2 className="h-5 w-5 animate-spin inline" />
                </td>
              </tr>
            ) : assignments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-10 text-center text-gray-500">
                  No hay asignaciones vigentes
                </td>
              </tr>
            ) : (
              assignments.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 whitespace-nowrap">
                    <p className="text-sm font-medium text-gray-900">
                      {a.employee.nombres} {a.employee.apellidoPaterno}
                    </p>
                    <p className="text-xs text-gray-500 font-mono">{a.employee.rut}</p>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400">{iconoCategoria(a.asset.categoria.nombre)}</span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          {a.asset.marca} {a.asset.modelo}
                        </p>
                        <p className="text-xs text-gray-500 font-mono">{a.asset.numeroSerie || "-"}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    <span className={cn("px-2 py-1 text-xs font-medium rounded-full", tipoMovimientoColors[a.tipoMovimiento])}>
                      {tipoMovimientoLabels[a.tipoMovimiento]}
                    </span>
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900">
                    {formatDate(a.fechaEntrega)}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap">
                    {a.activo ? (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
                        Activa
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
                        Devuelta
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-3 whitespace-nowrap text-right">
                    <div className="flex justify-end gap-1">
                      <Link
                        href={`/asignaciones/${a.id}`}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Ver detalle"
                      >
                        <Eye size={16} />
                      </Link>
                      <a
                        href={`/api/asignaciones/${a.id}/acta?tipo=${a.activo ? "entrega" : "devolucion"}`}
                        className="p-2 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg"
                        title="Descargar Acta"
                        target="_blank"
                      >
                        <FileText size={16} />
                      </a>
                      {a.activo && (
                        <Link
                          href={`/asignaciones/devolucion?id=${a.id}`}
                          className="p-2 text-gray-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg"
                          title="Registrar devolución"
                        >
                          <Undo2 size={16} />
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

      {pagination.totalPages > 1 && (
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {pagination.total} asignacion{pagination.total === 1 ? "" : "es"}
          </p>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
              disabled={pagination.page === 1}
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
                      ? "bg-blue-600 text-white border-blue-600 cursor-default"
                      : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
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
              className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
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
