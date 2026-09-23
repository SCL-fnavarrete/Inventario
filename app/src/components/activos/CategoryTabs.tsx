"use client";

import {
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CategoryIcon } from "@/components/activos/CategoryIcon";

interface CategoryData {
  id: string;
  nombre: string;
  count: number;
}

interface CategoryTabsProps {
  categories: CategoryData[];
  selectedCategory: string | null;
  onCategoryClick: (categoryId: string | null) => void;
  isLoading?: boolean;
}

// "Todos" y cada categoria son la misma pastilla; solo cambia si esta activa.
const pillClasses = (selected: boolean) =>
  cn(
    "flex items-center gap-2 px-4 py-2 rounded-control flex-shrink-0 font-medium text-sm transition-colors",
    selected ? "bg-brand text-white shadow-sm" : "bg-gray-100 text-fg-muted hover:bg-gray-200"
  );

const countClasses = (selected: boolean) =>
  cn(
    "px-2 py-0.5 rounded-full text-xs font-semibold",
    selected ? "bg-white/20 text-white" : "bg-gray-200 text-fg-muted"
  );

export function CategoryTabs({
  categories,
  selectedCategory,
  onCategoryClick,
  isLoading
}: CategoryTabsProps) {
  const totalCount = categories.reduce((sum, cat) => sum + cat.count, 0);

  if (isLoading) {
    return (
      <div className="flex gap-2 overflow-x-auto pb-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            className="h-10 w-28 bg-gray-100 rounded-lg animate-pulse flex-shrink-0"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300">
      <button onClick={() => onCategoryClick(null)} className={pillClasses(selectedCategory === null)}>
        <Layers className="w-4 h-4" />
        <span>Todos</span>
        <span className={countClasses(selectedCategory === null)}>{totalCount}</span>
      </button>

      {categories.map((category) => {
        const isSelected = selectedCategory === category.id;

        return (
          <button
            key={category.id}
            onClick={() => onCategoryClick(category.id)}
            className={pillClasses(isSelected)}
          >
            <CategoryIcon categoria={category.nombre} className="w-4 h-4" />
            <span>{category.nombre}</span>
            <span className={countClasses(isSelected)}>{category.count}</span>
          </button>
        );
      })}
    </div>
  );
}

export default CategoryTabs;
