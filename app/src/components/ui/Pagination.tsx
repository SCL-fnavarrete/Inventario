"use client";

import { useId } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PaginationProps {
  current: number;
  pages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
  /** Si se pasa, muestra el selector "Mostrar: N" por pagina. */
  onLimitChange?: (limit: number) => void;
  limitOptions?: number[];
  /** Sustantivo en plural para el resumen ("activos", "empleados"). */
  itemLabel?: string;
}

// Ventana de hasta 7 numeros centrada en la pagina actual.
function paginasVisibles(current: number, pages: number): number[] {
  const n = Math.min(pages, 7);
  const start =
    pages <= 7 || current <= 4 ? 1 : current >= pages - 3 ? pages - 6 : current - 3;
  return Array.from({ length: n }, (_, i) => start + i);
}

const navButton =
  "p-2 rounded-control border border-line-strong bg-surface text-fg-muted hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-surface transition-colors";

/**
 * Resumen "Mostrando X a Y de Z", selector de tamano de pagina y botones
 * de navegacion. La tabla y la vista de tarjetas de Activos tenian cada una
 * su copia completa (~90 lineas); aca vive una sola.
 */
export function Pagination({
  current,
  pages,
  total,
  limit,
  onPageChange,
  onLimitChange,
  limitOptions = [10, 20, 25, 50, 100],
  itemLabel = "registros",
}: PaginationProps) {
  const selectId = useId();
  const desde = (current - 1) * limit + 1;
  const hasta = Math.min(current * limit, total);

  return (
    <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <p className="text-sm font-medium text-fg-muted">
          Mostrando {desde} a {hasta} de {total} {itemLabel}
        </p>
        {onLimitChange && (
          <div className="flex items-center gap-2">
            <label htmlFor={selectId} className="text-sm text-fg-muted">
              Mostrar:
            </label>
            <select
              id={selectId}
              value={limit}
              onChange={(e) => onLimitChange(Number(e.target.value))}
              className="field-input field-input-sm w-auto"
            >
              {limitOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Navegación de páginas">
          <button
            onClick={() => onPageChange(current - 1)}
            disabled={current === 1}
            className={navButton}
            aria-label="Página anterior"
          >
            <ChevronLeft size={20} />
          </button>

          <div className="hidden items-center gap-1 sm:flex">
            {paginasVisibles(current, pages).map((page) => {
              const actual = page === current;
              return (
                <button
                  key={page}
                  onClick={() => onPageChange(page)}
                  disabled={actual}
                  className={cn(
                    "h-10 min-w-[40px] rounded-control border px-3 text-sm font-medium transition-colors",
                    actual
                      ? "cursor-default border-primary-700 bg-brand text-white"
                      : "border-line-strong bg-surface text-fg-muted hover:bg-gray-100"
                  )}
                  aria-current={actual ? "page" : undefined}
                >
                  {page}
                </button>
              );
            })}
          </div>

          <div className="px-4 py-2 text-sm font-medium text-fg-muted sm:hidden">
            Página {current} de {pages}
          </div>

          <button
            onClick={() => onPageChange(current + 1)}
            disabled={current === pages}
            className={navButton}
            aria-label="Página siguiente"
          >
            <ChevronRight size={20} />
          </button>
        </nav>
      )}
    </div>
  );
}

export default Pagination;
