"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Wrench,
  Calendar,
  User,
  DollarSign,
  Building,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  AlertCircle,
  Loader2,
  CheckCircle,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  estado: string;
  condicion: string;
  categoria: {
    nombre: string;
  };
  empleadoActual: {
    id: string;
    rut: string;
    nombres: string;
    apellidoPaterno: string;
  } | null;
};

const tipoOptions = [
  { value: "preventiva", label: "Preventiva", description: "Mantención programada regular" },
  { value: "correctiva", label: "Correctiva", description: "Reparación de fallo o problema" },
  { value: "actualizacion_so", label: "Actualización SO", description: "Actualización de sistema operativo" },
  { value: "limpieza", label: "Limpieza", description: "Limpieza física y lógica" },
  { value: "reparacion", label: "Reparación", description: "Reparación de hardware o software" },
];

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-5 w-5" />;
    case "celular":
      return <Smartphone className="h-5 w-5" />;
    case "monitor":
      return <Monitor className="h-5 w-5" />;
    default:
      return <Package className="h-5 w-5" />;
  }
}

export default function ProgramarMantencionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingAsset, setLoadingAsset] = useState(false);

  // Autocomplete states
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [formData, setFormData] = useState({
    tipo: "",
    descripcion: "",
    fechaProgramada: "",
    proximaMantencion: "",
    realizadoPor: "",
    costo: "",
    proveedorExterno: "",
  });

  // Load asset from URL parameter if present
  useEffect(() => {
    const activoId = searchParams.get("activoId");
    if (activoId) {
      loadAssetById(activoId);
    }
  }, [searchParams]);

  async function loadAssetById(id: string) {
    setLoadingAsset(true);
    setError("");

    try {
      const res = await fetch(`/api/activos/${id}`);
      if (!res.ok) {
        throw new Error("Activo no encontrado");
      }
      const asset = await res.json();
      setSelectedAsset(asset);
      setStep(2); // Skip to step 2 when asset is preselected
    } catch (err) {
      console.error("Error loading asset:", err);
      setError("Error al cargar el activo. Por favor, búscalo manualmente.");
    } finally {
      setLoadingAsset(false);
    }
  }

  // Search with debounce for autocomplete
  const searchAssets = useCallback(async (term: string) => {
    if (!term.trim()) {
      setAssets([]);
      setShowDropdown(false);
      return;
    }

    setSearching(true);
    setError("");

    try {
      const params = new URLSearchParams({
        search: term,
        limit: "10",
      });

      const res = await fetch(`/api/activos?${params}`);
      const data = await res.json();

      setAssets(data.data || []);
      setShowDropdown(true);
      setHighlightedIndex(-1);
    } catch (err) {
      console.error("Error searching assets:", err);
      setError("Error al buscar activos");
      setShowDropdown(false);
    } finally {
      setSearching(false);
    }
  }, []);

  // Handle search input change with debounce
  const handleSearchChange = (value: string) => {
    setSearchTerm(value);

    // Clear previous timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    if (value.trim()) {
      debounceTimerRef.current = setTimeout(() => {
        searchAssets(value);
      }, 300); // 300ms debounce
    } else {
      setAssets([]);
      setShowDropdown(false);
    }
  };

  // Handle asset selection
  const handleSelectAsset = (asset: Asset) => {
    setSelectedAsset(asset);
    setSearchTerm("");
    setShowDropdown(false);
    setAssets([]);
    setStep(2);
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown || assets.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < assets.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < assets.length) {
          handleSelectAsset(assets[highlightedIndex]);
        }
        break;
      case "Escape":
        e.preventDefault();
        setShowDropdown(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
        setHighlightedIndex(-1);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && dropdownRef.current) {
      const items = dropdownRef.current.querySelectorAll('[data-dropdown-item]');
      const highlightedItem = items[highlightedIndex] as HTMLElement;
      if (highlightedItem) {
        highlightedItem.scrollIntoView({
          block: 'nearest',
          behavior: 'smooth',
        });
      }
    }
  }, [highlightedIndex]);

  // Helper function to highlight matching text
  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;

    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, index) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={index} className="bg-yellow-200 text-gray-900 font-medium">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAsset || !formData.tipo || !formData.descripcion) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/mantenciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          tipo: formData.tipo,
          descripcion: formData.descripcion,
          fechaProgramada: formData.fechaProgramada || null,
          proximaMantencion: formData.proximaMantencion || null,
          realizadoPor: formData.realizadoPor || null,
          costo: formData.costo ? parseFloat(formData.costo) : null,
          proveedorExterno: formData.proveedorExterno || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al programar mantención");
        return;
      }

      router.push(`/mantenciones/${data.id}`);
    } catch (err) {
      console.error("Error creating maintenance:", err);
      setError("Error al programar mantención");
    } finally {
      setSubmitting(false);
    }
  }

  // Show loading spinner when loading asset from URL
  if (loadingAsset) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando activo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/mantenciones"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programar Mantención</h1>
          <p className="text-gray-600">Programar una nueva mantención para un activo</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                step >= s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
              )}
            >
              {step > s ? <CheckCircle size={16} /> : s}
            </div>
            {s < 3 && (
              <div
                className={cn(
                  "w-16 h-1 mx-2",
                  step > s ? "bg-blue-600" : "bg-gray-200"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Seleccionar Activo */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
              1
            </span>
            Seleccionar Activo
          </h2>

          {/* Autocomplete Search Input */}
          <div className="mb-4 relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none z-10" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar por número de serie, marca, modelo..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                onKeyDown={handleKeyDown}
                onFocus={() => {
                  if (assets.length > 0) setShowDropdown(true);
                }}
                className="w-full pl-10 pr-10 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                autoComplete="off"
              />
              {searching && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-600 animate-spin" />
              )}
              {searchTerm && !searching && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setAssets([]);
                    setShowDropdown(false);
                    searchInputRef.current?.focus();
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={20} />
                </button>
              )}
            </div>

            {/* Dropdown with suggestions */}
            {showDropdown && assets.length > 0 && (
              <div
                ref={dropdownRef}
                className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 max-h-96 overflow-y-auto"
              >
                <div className="p-2">
                  <p className="text-xs text-gray-500 px-3 py-2">
                    {assets.length} resultado{assets.length !== 1 ? "s" : ""} encontrado{assets.length !== 1 ? "s" : ""}
                  </p>
                  {assets.map((asset, index) => (
                    <button
                      key={asset.id}
                      data-dropdown-item
                      onClick={() => handleSelectAsset(asset)}
                      onMouseEnter={() => setHighlightedIndex(index)}
                      className={cn(
                        "w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left",
                        highlightedIndex === index
                          ? "bg-blue-50 border-2 border-blue-500"
                          : "hover:bg-gray-50 border-2 border-transparent"
                      )}
                    >
                      <span className={cn(
                        "flex-shrink-0 transition-colors",
                        highlightedIndex === index ? "text-blue-600" : "text-gray-400"
                      )}>
                        {getCategoryIcon(asset.categoria.nombre)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {highlightText(`${asset.marca} ${asset.modelo}`, searchTerm)}
                        </p>
                        <p className="text-sm text-gray-600 truncate">
                          <span className="font-medium">{asset.categoria.nombre}</span>
                          {" • "}
                          <span>
                            {asset.numeroSerie
                              ? highlightText(asset.numeroSerie, searchTerm)
                              : "Sin número de serie"}
                          </span>
                        </p>
                        {asset.empleadoActual && (
                          <p className="text-xs text-gray-500 truncate mt-1">
                            Asignado a: {asset.empleadoActual.nombres} {asset.empleadoActual.apellidoPaterno}
                          </p>
                        )}
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap",
                            asset.estado === "disponible" && "bg-green-100 text-green-700",
                            asset.estado === "asignado" && "bg-blue-100 text-blue-700",
                            asset.estado === "en_mantencion" && "bg-orange-100 text-orange-700"
                          )}
                        >
                          {asset.estado}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="border-t border-gray-200 px-3 py-2 bg-gray-50 rounded-b-lg">
                  <p className="text-xs text-gray-500">
                    Usa las flechas <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">↑</kbd> <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">↓</kbd> para navegar y <kbd className="px-1.5 py-0.5 bg-white border border-gray-300 rounded text-xs">Enter</kbd> para seleccionar
                  </p>
                </div>
              </div>
            )}

            {/* No results message */}
            {!searching && searchTerm && assets.length === 0 && (
              <div className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-6">
                <div className="text-center text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-gray-700">No se encontraron activos</p>
                  <p className="text-sm mt-1">Intenta con otros términos de búsqueda</p>
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          {/* Help text */}
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex gap-3">
              <Search className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Búsqueda inteligente
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Comienza a escribir para ver sugerencias en tiempo real. Puedes buscar por número de serie, marca, modelo o categoría.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Tipo de Mantención */}
      {step === 2 && selectedAsset && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
              2
            </span>
            Tipo de Mantención
          </h2>

          {/* Selected Asset Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-gray-400">
                {getCategoryIcon(selectedAsset.categoria.nombre)}
              </span>
              <div>
                <p className="font-medium">
                  {selectedAsset.marca} {selectedAsset.modelo}
                </p>
                <p className="text-sm text-gray-500">
                  {selectedAsset.numeroSerie || "Sin serie"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tipoOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setFormData((prev) => ({ ...prev, tipo: option.value }));
                  setStep(3);
                }}
                className={cn(
                  "p-4 rounded-lg border text-left transition-colors",
                  formData.tipo === option.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                )}
              >
                <p className="font-medium">{option.label}</p>
                <p className="text-sm text-gray-500 mt-1">{option.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Detalles de la Mantención */}
      {step === 3 && selectedAsset && formData.tipo && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
              3
            </span>
            Detalles de la Mantención
          </h2>

          {/* Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Activo</p>
              <p className="font-medium">
                {selectedAsset.marca} {selectedAsset.modelo}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tipo de Mantención</p>
              <p className="font-medium">
                {tipoOptions.find((t) => t.value === formData.tipo)?.label}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Describe la mantención a realizar..."
                value={formData.descripcion}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Fecha Programada
              </label>
              <input
                type="date"
                value={formData.fechaProgramada}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, fechaProgramada: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Próxima Mantención
              </label>
              <input
                type="date"
                value={formData.proximaMantencion}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, proximaMantencion: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="inline h-4 w-4 mr-1" />
                Técnico Asignado
              </label>
              <input
                type="text"
                placeholder="Nombre del técnico"
                value={formData.realizadoPor}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, realizadoPor: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="inline h-4 w-4 mr-1" />
                Costo Estimado (CLP)
              </label>
              <input
                type="number"
                placeholder="0"
                min="0"
                value={formData.costo}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, costo: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Building className="inline h-4 w-4 mr-1" />
                Proveedor Externo (si aplica)
              </label>
              <input
                type="text"
                placeholder="Nombre del proveedor"
                value={formData.proveedorExterno}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, proveedorExterno: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.descripcion}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Wrench size={20} />
              )}
              Programar Mantención
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
