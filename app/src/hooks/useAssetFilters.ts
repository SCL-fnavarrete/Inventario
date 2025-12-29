"use client";

import { useCallback, useMemo } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface AssetFilters {
  search: string;
  estado: string | null;
  categoriaId: string | null;
  condicion: string | null;
  page: number;
  limit: number;
}

interface CategoryData {
  id: string;
  nombre: string;
}

interface UseAssetFiltersOptions {
  categories?: CategoryData[];
}

const statusLabels: Record<string, string> = {
  disponible: "Disponible",
  asignado: "Asignado",
  en_mantencion: "En Mantenci\u00f3n",
  reutilizable: "Reutilizable",
  baja: "Baja",
};

const conditionLabels: Record<string, string> = {
  nuevo: "Nuevo",
  bueno: "Bueno",
  regular: "Regular",
  malo: "Malo",
};

export function useAssetFilters(options: UseAssetFiltersOptions = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { categories = [] } = options;

  // Parse current filters from URL
  const filters: AssetFilters = useMemo(() => ({
    search: searchParams.get("search") || "",
    estado: searchParams.get("estado") || null,
    categoriaId: searchParams.get("categoriaId") || null,
    condicion: searchParams.get("condicion") || null,
    page: parseInt(searchParams.get("page") || "1"),
    limit: parseInt(searchParams.get("limit") || "10"),
  }), [searchParams]);

  // Create URL with updated params
  const createQueryString = useCallback(
    (updates: Partial<AssetFilters>) => {
      const params = new URLSearchParams(searchParams.toString());

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === "" || value === undefined) {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      });

      // Reset page when filters change (except page itself)
      if (!("page" in updates)) {
        params.set("page", "1");
      }

      return params.toString();
    },
    [searchParams]
  );

  // Update filters in URL
  const updateFilters = useCallback(
    (updates: Partial<AssetFilters>) => {
      const queryString = createQueryString(updates);
      router.push(`${pathname}?${queryString}`, { scroll: false });
    },
    [router, pathname, createQueryString]
  );

  // Individual filter setters
  const setSearch = useCallback(
    (search: string) => updateFilters({ search }),
    [updateFilters]
  );

  const setEstado = useCallback(
    (estado: string | null) => updateFilters({ estado }),
    [updateFilters]
  );

  const setCategoriaId = useCallback(
    (categoriaId: string | null) => updateFilters({ categoriaId }),
    [updateFilters]
  );

  const setCondicion = useCallback(
    (condicion: string | null) => updateFilters({ condicion }),
    [updateFilters]
  );

  const setPage = useCallback(
    (page: number) => updateFilters({ page }),
    [updateFilters]
  );

  const setLimit = useCallback(
    (limit: number) => updateFilters({ limit, page: 1 }),
    [updateFilters]
  );

  // Clear all filters
  const clearFilters = useCallback(() => {
    router.push(pathname, { scroll: false });
  }, [router, pathname]);

  // Remove a specific filter
  const removeFilter = useCallback(
    (key: keyof AssetFilters) => {
      updateFilters({ [key]: null });
    },
    [updateFilters]
  );

  // Get active filters for display
  const activeFilters = useMemo(() => {
    const result: Array<{
      key: string;
      label: string;
      value: string;
      displayValue: string;
    }> = [];

    if (filters.search) {
      result.push({
        key: "search",
        label: "B\u00fasqueda",
        value: filters.search,
        displayValue: `"${filters.search}"`,
      });
    }

    if (filters.estado) {
      result.push({
        key: "estado",
        label: "Estado",
        value: filters.estado,
        displayValue: statusLabels[filters.estado] || filters.estado,
      });
    }

    if (filters.categoriaId) {
      const category = categories.find((c) => c.id === filters.categoriaId);
      result.push({
        key: "categoriaId",
        label: "Categor\u00eda",
        value: filters.categoriaId,
        displayValue: category?.nombre || filters.categoriaId,
      });
    }

    if (filters.condicion) {
      result.push({
        key: "condicion",
        label: "Condici\u00f3n",
        value: filters.condicion,
        displayValue: conditionLabels[filters.condicion] || filters.condicion,
      });
    }

    return result;
  }, [filters, categories]);

  // Check if any filters are active
  const hasActiveFilters = activeFilters.length > 0;

  return {
    filters,
    activeFilters,
    hasActiveFilters,
    updateFilters,
    setSearch,
    setEstado,
    setCategoriaId,
    setCondicion,
    setPage,
    setLimit,
    clearFilters,
    removeFilter,
  };
}

export default useAssetFilters;
