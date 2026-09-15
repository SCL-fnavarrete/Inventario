"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Loader2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  X,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { etiquetaConectividad } from "@/lib/utils/assetSpecs";

type Asset = {
  id: string;
  numeroSerie: string | null;
  imei: string | null;
  marca: string;
  modelo: string;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  numeroTelefono: string | null;
  tipoPlan: string | null;
  pulgadas: string | number | null;
  conectividad: string | null;
  estado: string;
  condicion: string;
  categoria: {
    id: string;
    nombre: string;
  };
};

interface SelectorActivosProps {
  selectedAssets: Asset[];
  onSelectionChange: (assets: Asset[]) => void;
  // Acota el inventario a una sede especifica -- lo usa el admin en Nueva
  // Guia de Despacho una vez que elige la sede origen (ver SPEC 2.9), para
  // no poder mezclar en un mismo despacho equipos de sedes distintas. Un
  // tecnico no necesita pasarlo: /api/activos ya lo acota solo a lo suyo.
  sedeId?: string;
}

function getCategoryIcon(categoryName: string) {
  const iconClass = "h-4 w-4";
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className={iconClass} />;
    case "celular":
      return <Smartphone className={iconClass} />;
    case "monitor":
      return <Monitor className={iconClass} />;
    default:
      return <Package className={iconClass} />;
  }
}

function getConditionBadge(condicion: string) {
  const labels: Record<string, string> = {
    nuevo: "Nuevo",
    usado: "Usado",
    danado: "Dañado",
  };
  const colors: Record<string, string> = {
    nuevo: "bg-green-100 text-green-700",
    usado: "bg-amber-100 text-amber-700",
    danado: "bg-red-100 text-red-700",
  };
  return (
    <span className={cn("px-1.5 py-0.5 text-xs font-medium rounded", colors[condicion] || "bg-gray-100 text-gray-700")}>
      {labels[condicion] || condicion}
    </span>
  );
}

export function SelectorActivos({
  selectedAssets,
  onSelectionChange,
  sedeId,
}: SelectorActivosProps) {
  const [loading, setLoading] = useState(false);
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    fetchAssets();
    fetchCategories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId]);

  async function fetchAssets() {
    setLoading(true);
    try {
      // Solo "disponible": una guia de despacho exige que el activo este
      // disponible al crearla (ver POST /api/guias-despacho). El filtro de
      // sede solo tiene efecto para admin (ver /api/activos); para tecnico ya
      // viene acotado por sesion.
      const params = new URLSearchParams({ estado: "disponible", limit: "200" });
      if (sedeId) params.set("sedeId", sedeId);
      const disponibles = await fetch(`/api/activos?${params}`).then((r) => r.json());
      setAvailableAssets(disponibles.data || []);
    } catch (err) {
      console.error("Error fetching assets:", err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categorias");
      const data = await res.json();
      setCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }

  function toggleAsset(asset: Asset) {
    const isSelected = selectedAssets.some((a) => a.id === asset.id);
    if (isSelected) {
      onSelectionChange(selectedAssets.filter((a) => a.id !== asset.id));
    } else {
      onSelectionChange([...selectedAssets, asset]);
    }
  }

  function removeAsset(assetId: string) {
    onSelectionChange(selectedAssets.filter((a) => a.id !== assetId));
  }

  function selectAll() {
    const newSelection = [...selectedAssets];
    filteredAssets.forEach((asset) => {
      if (!selectedAssets.some((a) => a.id === asset.id)) {
        newSelection.push(asset);
      }
    });
    onSelectionChange(newSelection);
  }

  function deselectAll() {
    const filteredIds = new Set(filteredAssets.map((a) => a.id));
    onSelectionChange(selectedAssets.filter((a) => !filteredIds.has(a.id)));
  }

  const filteredAssets = availableAssets.filter((asset) => {
    const matchesSearch =
      !searchTerm ||
      asset.marca.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.modelo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.numeroSerie?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.imei?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      asset.numeroTelefono?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory =
      categoryFilter === "all" || asset.categoria.id === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  const allFilteredSelected = filteredAssets.length > 0 &&
    filteredAssets.every((asset) => selectedAssets.some((a) => a.id === asset.id));

  const someFilteredSelected = filteredAssets.some((asset) =>
    selectedAssets.some((a) => a.id === asset.id));

  return (
    <div className="space-y-4">
      {/* Filtros en línea */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
          <input
            type="text"
            placeholder="Buscar por marca, modelo, serie, IMEI o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none bg-white cursor-pointer"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
        </div>
      </div>

      {/* Equipos seleccionados */}
      {selectedAssets.length > 0 && (
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-blue-800">
              {selectedAssets.length} equipo(s) seleccionado(s)
            </span>
            <button
              onClick={() => onSelectionChange([])}
              className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            >
              Limpiar todo
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedAssets.map((asset) => (
              <span
                key={asset.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-blue-200 text-blue-800 rounded text-xs"
              >
                {getCategoryIcon(asset.categoria.nombre)}
                <span className="font-medium">{asset.marca} {asset.modelo}</span>
                {asset.numeroSerie && (
                  <span className="text-blue-600">({asset.numeroSerie})</span>
                )}
                <button
                  onClick={() => removeAsset(asset.id)}
                  className="ml-0.5 hover:text-blue-600"
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tabla de equipos */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin mr-2 text-blue-600" size={20} />
          <span className="text-gray-600 text-sm">Cargando equipos...</span>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          No se encontraron equipos disponibles
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header de tabla */}
          <div className="bg-gray-50 border-b border-gray-200 px-3 py-2 flex items-center gap-3 text-xs font-medium text-gray-600 uppercase tracking-wide">
            <div className="w-6">
              <button
                onClick={allFilteredSelected ? deselectAll : selectAll}
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                  allFilteredSelected
                    ? "bg-blue-600 border-blue-600 text-white"
                    : someFilteredSelected
                    ? "bg-blue-100 border-blue-400"
                    : "border-gray-300 hover:border-blue-400"
                )}
              >
                {allFilteredSelected && <Check size={12} />}
                {someFilteredSelected && !allFilteredSelected && (
                  <div className="w-2 h-0.5 bg-blue-600 rounded" />
                )}
              </button>
            </div>
            <div className="w-8">Tipo</div>
            <div className="flex-1">Equipo</div>
            <div className="w-28 hidden sm:block">Serie/IMEI</div>
            <div className="w-20 hidden md:block">Info</div>
            <div className="w-14 text-center">Estado</div>
          </div>

          {/* Filas */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-100">
            {filteredAssets.map((asset) => {
              const isSelected = selectedAssets.some((a) => a.id === asset.id);
              const categoria = asset.categoria.nombre.toLowerCase();

              // Info adicional según categoría (14-sep-2026, SPEC 2.19):
              // antes solo cubría Notebook y Celular, dejando Monitor y los
              // periféricos (Mouse/Teclado/Webcam/Audífonos) sin nada en
              // esta columna aunque tuvieran su dato propio cargado.
              let extraInfo = "";
              if (categoria === "notebook" && asset.procesador) {
                extraInfo = `${asset.ram || ""} ${asset.discoDuro || ""}`.trim();
              } else if (categoria === "celular" && asset.numeroTelefono) {
                extraInfo = asset.numeroTelefono;
              } else if (categoria === "monitor" && asset.pulgadas) {
                extraInfo = `${asset.pulgadas}"`;
              } else if (asset.conectividad) {
                extraInfo = etiquetaConectividad(asset.conectividad);
              }

              return (
                <div
                  key={asset.id}
                  onClick={() => toggleAsset(asset)}
                  className={cn(
                    "px-3 py-2.5 flex items-center gap-3 cursor-pointer transition-colors text-sm",
                    isSelected
                      ? "bg-blue-50 hover:bg-blue-100"
                      : "hover:bg-gray-50"
                  )}
                >
                  {/* Checkbox */}
                  <div className="w-6">
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-all",
                        isSelected
                          ? "bg-blue-600 border-blue-600 text-white"
                          : "border-gray-300"
                      )}
                    >
                      {isSelected && <Check size={12} />}
                    </div>
                  </div>

                  {/* Icono categoría */}
                  <div className={cn(
                    "w-8 flex justify-center",
                    isSelected ? "text-blue-600" : "text-gray-500"
                  )}>
                    {getCategoryIcon(asset.categoria.nombre)}
                  </div>

                  {/* Equipo */}
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      "font-medium",
                      isSelected ? "text-blue-900" : "text-gray-900"
                    )}>
                      {asset.marca} {asset.modelo}
                    </span>
                    <span className="text-gray-500 text-xs ml-2 hidden lg:inline">
                      {asset.categoria.nombre}
                    </span>
                  </div>

                  {/* Serie/IMEI */}
                  <div className="w-28 hidden sm:block text-xs text-gray-600 font-mono truncate">
                    {asset.numeroSerie || asset.imei || "-"}
                  </div>

                  {/* Info extra */}
                  <div className="w-20 hidden md:block text-xs text-gray-500 truncate">
                    {extraInfo || "-"}
                  </div>

                  {/* Condición */}
                  <div className="w-14 text-center">
                    {getConditionBadge(asset.condicion)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer con total */}
          <div className="bg-gray-50 border-t border-gray-200 px-3 py-2 text-xs text-gray-500">
            Mostrando {filteredAssets.length} equipo(s) disponible(s)
          </div>
        </div>
      )}
    </div>
  );
}
