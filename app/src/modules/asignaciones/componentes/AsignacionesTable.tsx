"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Eye, Phone, Search } from "lucide-react";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { CategoryIcon } from "@/modules/activos/componentes";
import { useDebouncedValue } from "@/shared/hooks/useDebouncedValue";
import { useSedeSeleccionada } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { identificadorActivo } from "@/modules/activos";
import { formatearNumero } from "@/modules/lineas";

type Persona = {
  id: string;
  rut: string | null;
  nombres: string;
  apellidoPaterno: string;
};

// Una fila es un equipo entregado o una linea con persona (SPEC 2.143).
type Fila =
  | {
      clase: "equipo";
      id: string;
      fechaEntrega: string | null;
      asset: {
        id: string;
        numeroSerie: string | null;
        marca: string;
        modelo: string;
        categoria: { nombre: string };
      };
      employee: Persona;
    }
  | {
      clase: "linea";
      id: string;
      fechaEntrega: string | null;
      linea: { numero: string; operador: string | null; tipoChip: string | null };
      activo: { id: string; marca: string; modelo: string } | null;
      employee: Persona;
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
  const [assignments, setAssignments] = useState<Fila[]>([]);
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
          incluirLineas: "true",
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
  }, [pagination.page, pagination.limit, debouncedSearch, sedeSeleccionada]);

  return (
    <div className="card overflow-hidden">
      <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
          <div>
            <h2 className="text-lg font-semibold text-fg">Asignaciones</h2>
            <p className="text-sm text-fg-subtle">Equipos y líneas entregados a empleados actualmente</p>
          </div>
          <div className="relative flex-1 max-w-sm sm:ml-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-fg-subtle" />
            <input
              type="text"
              placeholder="Buscar por RUT, nombre, equipo o línea..."
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

      <TablaDatos
        sinMarco
        items={assignments}
        clave={(a) => `${a.clase}-${a.id}`}
        cargando={loading}
        vacio="No hay asignaciones vigentes"
        columnas={[
          {
            titulo: "Empleado",
            sinSalto: true,
            celda: (a) => (
              <>
                <p className="text-sm font-medium text-fg">
                  {a.employee.nombres} {a.employee.apellidoPaterno}
                </p>
                <p className="font-mono text-xs text-fg-subtle">{a.employee.rut ?? "-"}</p>
              </>
            ),
          },
          {
            titulo: "Equipo",
            sinSalto: true,
            celda: (a) =>
              a.clase === "linea" ? (
                <div className="flex items-center gap-2">
                  <span className="text-fg-subtle">
                    <Phone className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">Línea {formatearNumero(a.linea.numero)}</p>
                    <p className="text-xs text-fg-subtle">
                      {[a.linea.operador, a.linea.tipoChip].filter(Boolean).join(" · ")}
                      {a.activo ? ` · en ${a.activo.marca} ${a.activo.modelo}` : " · su propio teléfono"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-fg-subtle">
                    <CategoryIcon categoria={a.asset.categoria.nombre} className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-fg">
                      {a.asset.marca} {a.asset.modelo}
                    </p>
                    <p className="font-mono text-xs text-fg-subtle">{identificadorActivo(a.asset, "-")}</p>
                  </div>
                </div>
              ),
          },
          { titulo: "Entrega", sinSalto: true, celda: (a) => formatearFecha(a.fechaEntrega, {}, "-") },
        ]}
        acciones={(a) => (
          <Link
            href={a.clase === "linea" ? `/activos/lineas/${a.id}` : `/asignaciones/${a.id}`}
            className="rounded-lg p-2 text-fg-subtle hover:bg-primary-50 hover:text-primary-700"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <Eye size={16} />
          </Link>
        )}
        paginacion={{
          current: pagination.page,
          pages: pagination.totalPages,
          total: pagination.total,
          limit: pagination.limit,
          itemLabel: "asignaciones y líneas",
          onPageChange: (page) => setPagination((prev) => ({ ...prev, page })),
          onLimitChange: (limit) => setPagination((prev) => ({ ...prev, limit, page: 1 })),
        }}
      />
    </div>
  );
}
