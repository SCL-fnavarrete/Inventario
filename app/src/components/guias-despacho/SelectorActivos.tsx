"use client";

import { useState, useEffect } from "react";
import {
  Search,
  Loader2,
  X,
  ChevronDown,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { etiquetaConectividad } from "@/lib/utils/assetSpecs";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { AssetConditionBadge } from "@/components/ui/Badge";

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
  // Acota el inventario a una sede especifica -- lo usa el admin al elegir
  // la sede origen en Nueva Guia de Despacho, para no mezclar en un mismo
  // despacho equipos de sedes distintas. Un tecnico no necesita pasarlo:
  // /api/activos ya lo acota solo a lo suyo.
  sedeId?: string;
}

// Cuantos equipos se muestran por busqueda: la lista es para elegir, y el
// buscador busca en todo el inventario de la sede (SPEC 2.108).
const LIMITE_RESULTADOS = 30;

export function SelectorActivos({
  selectedAssets,
  onSelectionChange,
  sedeId,
}: SelectorActivosProps) {
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [totalDisponibles, setTotalDisponibles] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const busqueda = useDebouncedValue(searchTerm, 350);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [categories, setCategories] = useState<{ id: string; nombre: string }[]>([]);

  useEffect(() => {
    fetch("/api/categorias")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, []);

  // Busqueda en el servidor, con las mismas reglas que Activos (por palabras,
  // en marca, modelo, serie...). Antes se traian hasta 200 y se filtraba en
  // pantalla: con mas equipos, el resto no aparecia y no se avisaba.
  // Solo "disponible": una guia exige que el equipo este disponible. El
  // filtro de sede solo tiene efecto para admin; el tecnico ya viene
  // acotado por sesion.
  const params = new URLSearchParams({ estado: "disponible", limit: String(LIMITE_RESULTADOS) });
  if (sedeId) params.set("sedeId", sedeId);
  if (busqueda.trim()) params.set("search", busqueda.trim());
  if (categoryFilter !== "all") params.set("categoriaId", categoryFilter);
  const consulta = params.toString();
  // Carga mientras la ultima respuesta no sea de la consulta actual.
  const [cargada, setCargada] = useState<string | null>(null);
  const loading = cargada !== consulta;

  useEffect(() => {
    let vigente = true;
    fetch(`/api/activos?${consulta}`)
      .then((r) => (r.ok ? r.json() : { data: [], pagination: { total: 0 } }))
      .catch(() => ({ data: [], pagination: { total: 0 } }))
      .then((data) => {
        if (!vigente) return;
        setAvailableAssets(data.data || []);
        setTotalDisponibles(data.pagination?.total ?? 0);
        setCargada(consulta);
      });
    return () => {
      vigente = false;
    };
  }, [consulta]);

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

  // Ya vienen filtrados por el servidor.
  const filteredAssets = availableAssets;

  const allFilteredSelected = filteredAssets.length > 0 &&
    filteredAssets.every((asset) => selectedAssets.some((a) => a.id === asset.id));

  const someFilteredSelected = filteredAssets.some((asset) =>
    selectedAssets.some((a) => a.id === asset.id));

  return (
    <div className="space-y-4">
      {/* Filtros en línea */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-subtle" size={18} />
          <input
            type="text"
            placeholder="Buscar por marca, modelo o serie..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="field-input pl-9 pr-3 text-sm outline-none"
          />
        </div>
        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="appearance-none pl-3 pr-8 py-2 text-sm border border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-surface cursor-pointer"
          >
            <option value="all">Todas las categorías</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.nombre}
              </option>
            ))}
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" size={16} />
        </div>
      </div>

      {/* Equipos seleccionados */}
      {selectedAssets.length > 0 && (
        <div className="p-3 bg-primary-50 border border-primary-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-primary-900">
              {selectedAssets.length} equipo(s) seleccionado(s)
            </span>
            <button
              type="button"
              onClick={() => onSelectionChange([])}
              className="text-xs text-primary-700 hover:text-primary-900 hover:underline"
            >
              Limpiar todo
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedAssets.map((asset) => (
              <span
                key={asset.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 bg-surface border border-primary-200 text-primary-900 rounded text-xs"
              >
                <CategoryIcon categoria={asset.categoria.nombre} className="h-4 w-4" />
                <span className="text-primary-700">{asset.categoria.nombre}</span>
                <span className="font-medium">{asset.marca} {asset.modelo}</span>
                {asset.numeroSerie && (
                  <span className="text-primary-700">({asset.numeroSerie})</span>
                )}
                <button
                  type="button"
                  aria-label={`Quitar ${asset.marca} ${asset.modelo}`}
                  onClick={() => removeAsset(asset.id)}
                  className="ml-0.5 hover:text-primary-700"
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
          <Loader2 className="animate-spin mr-2 text-primary-700" size={20} />
          <span className="text-fg-muted text-sm">Cargando equipos...</span>
        </div>
      ) : filteredAssets.length === 0 ? (
        <div className="text-center py-8 text-fg-subtle text-sm">
          No se encontraron equipos disponibles
        </div>
      ) : (
        <div className="border border-line rounded-lg overflow-hidden">
          {/* Header de tabla */}
          <div className="bg-surface-muted border-b border-line px-3 py-2 flex items-center gap-3 text-xs font-medium text-fg-muted uppercase tracking-wide">
            <div className="w-6">
              <button
                type="button"
                aria-label={allFilteredSelected ? "Quitar los mostrados" : "Elegir los mostrados"}
                onClick={allFilteredSelected ? deselectAll : selectAll}
                className={cn(
                  "w-4 h-4 rounded border flex items-center justify-center transition-colors",
                  allFilteredSelected
                    ? "bg-brand border-primary-700 text-white"
                    : someFilteredSelected
                    ? "bg-primary-100 border-primary-400"
                    : "border-line-strong hover:border-primary-400"
                )}
              >
                {allFilteredSelected && <Check size={12} />}
                {someFilteredSelected && !allFilteredSelected && (
                  <div className="w-2 h-0.5 bg-brand rounded" />
                )}
              </button>
            </div>
            <div className="w-8">Tipo</div>
            <div className="flex-1">Equipo</div>
            <div className="w-28 hidden sm:block">Serie/IMEI</div>
            <div className="w-20 hidden md:block">Info</div>
            <div className="w-20 text-center">Condición</div>
          </div>

          {/* Filas */}
          <div className="max-h-[400px] overflow-y-auto divide-y divide-line">
            {filteredAssets.map((asset) => {
              const isSelected = selectedAssets.some((a) => a.id === asset.id);
              const categoria = asset.categoria.nombre.toLowerCase();

              // Info adicional según categoría: cada tipo de activo muestra
              // su propio dato relevante en esta columna.
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
                      ? "bg-primary-50 hover:bg-primary-100"
                      : "hover:bg-surface-muted"
                  )}
                >
                  {/* Checkbox */}
                  <div className="w-6">
                    <div
                      className={cn(
                        "w-4 h-4 rounded border flex items-center justify-center transition-all",
                        isSelected
                          ? "bg-brand border-primary-700 text-white"
                          : "border-line-strong"
                      )}
                    >
                      {isSelected && <Check size={12} />}
                    </div>
                  </div>

                  {/* Icono categoría */}
                  <div className={cn(
                    "w-8 flex justify-center",
                    isSelected ? "text-primary-700" : "text-fg-subtle"
                  )}>
                    <CategoryIcon categoria={asset.categoria.nombre} className="h-4 w-4" />
                  </div>

                  {/* Equipo */}
                  <div className="flex-1 min-w-0">
                    <span className={cn(
                      "font-medium",
                      isSelected ? "text-primary-950" : "text-fg"
                    )}>
                      {asset.marca} {asset.modelo}
                    </span>
                    {/* Nombre de categoria visible ademas del icono, en todos los
                        tamaños de pantalla. */}
                    <span className="text-fg-subtle text-xs ml-2">
                      {asset.categoria.nombre}
                    </span>
                  </div>

                  {/* Serie/IMEI */}
                  <div className="w-28 hidden sm:block text-xs text-fg-muted font-mono truncate">
                    {asset.numeroSerie || asset.imei || "-"}
                  </div>

                  {/* Info extra */}
                  <div className="w-20 hidden md:block text-xs text-fg-subtle truncate">
                    {extraInfo || "-"}
                  </div>

                  {/* Condición */}
                  <div className="w-20 text-center">
                    <AssetConditionBadge condicion={asset.condicion} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer con total */}
          <div className="bg-surface-muted border-t border-line px-3 py-2 text-xs text-fg-subtle">
            {totalDisponibles > filteredAssets.length
              ? `Mostrando ${filteredAssets.length} de ${totalDisponibles} disponibles: escribe para acotar la búsqueda`
              : `${filteredAssets.length} equipo(s) disponible(s)`}
          </div>
        </div>
      )}
    </div>
  );
}
