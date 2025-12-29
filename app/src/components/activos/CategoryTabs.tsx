"use client";

import {
  Laptop,
  Smartphone,
  Monitor,
  Mouse,
  Headphones,
  Printer,
  Package,
  Layers
} from "lucide-react";

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

const categoryIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  notebook: Laptop,
  laptop: Laptop,
  celular: Smartphone,
  telefono: Smartphone,
  smartphone: Smartphone,
  monitor: Monitor,
  mouse: Mouse,
  audifonos: Headphones,
  audifono: Headphones,
  impresora: Printer,
  printer: Printer,
};

function getCategoryIcon(categoryName: string): React.ComponentType<{ className?: string }> {
  const lowerName = categoryName.toLowerCase();
  for (const [key, Icon] of Object.entries(categoryIcons)) {
    if (lowerName.includes(key)) {
      return Icon;
    }
  }
  return Package;
}

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
      <button
        onClick={() => onCategoryClick(null)}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg
          transition-all duration-200 flex-shrink-0
          font-medium text-sm
          ${selectedCategory === null
            ? "bg-blue-600 text-white shadow-md"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }
        `}
      >
        <Layers className="w-4 h-4" />
        <span>Todos</span>
        <span className={`
          px-2 py-0.5 rounded-full text-xs font-semibold
          ${selectedCategory === null
            ? "bg-white/20 text-white"
            : "bg-gray-200 text-gray-600"
          }
        `}>
          {totalCount}
        </span>
      </button>

      {categories.map((category) => {
        const Icon = getCategoryIcon(category.nombre);
        const isSelected = selectedCategory === category.id;

        return (
          <button
            key={category.id}
            onClick={() => onCategoryClick(category.id)}
            className={`
              flex items-center gap-2 px-4 py-2 rounded-lg
              transition-all duration-200 flex-shrink-0
              font-medium text-sm
              ${isSelected
                ? "bg-blue-600 text-white shadow-md"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }
            `}
          >
            <Icon className="w-4 h-4" />
            <span>{category.nombre}</span>
            <span className={`
              px-2 py-0.5 rounded-full text-xs font-semibold
              ${isSelected
                ? "bg-white/20 text-white"
                : "bg-gray-200 text-gray-600"
              }
            `}>
              {category.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default CategoryTabs;
