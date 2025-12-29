"use client";

import { X, Trash2 } from "lucide-react";

interface Filter {
  key: string;
  label: string;
  value: string;
  displayValue: string;
}

interface ActiveFiltersProps {
  filters: Filter[];
  onRemoveFilter: (key: string) => void;
  onClearAll: () => void;
}

const filterColors: Record<string, string> = {
  estado: "bg-blue-100 text-blue-800 border-blue-200",
  categoria: "bg-purple-100 text-purple-800 border-purple-200",
  condicion: "bg-amber-100 text-amber-800 border-amber-200",
  search: "bg-gray-100 text-gray-800 border-gray-200",
};

export function ActiveFilters({ filters, onRemoveFilter, onClearAll }: ActiveFiltersProps) {
  if (filters.length === 0) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm text-gray-500 font-medium">Filtros:</span>

      {filters.map((filter) => (
        <span
          key={filter.key}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5
            rounded-full text-sm font-medium border
            ${filterColors[filter.key] || filterColors.search}
          `}
        >
          <span className="text-xs text-gray-500">{filter.label}:</span>
          <span>{filter.displayValue}</span>
          <button
            onClick={() => onRemoveFilter(filter.key)}
            className="ml-1 p-0.5 rounded-full hover:bg-black/10 transition-colors"
            aria-label={`Remover filtro ${filter.label}`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      ))}

      {filters.length > 1 && (
        <button
          onClick={onClearAll}
          className="
            inline-flex items-center gap-1 px-3 py-1.5
            text-sm text-red-600 hover:text-red-700
            hover:bg-red-50 rounded-full transition-colors
          "
        >
          <Trash2 className="w-3.5 h-3.5" />
          Limpiar todo
        </button>
      )}
    </div>
  );
}

export default ActiveFilters;
