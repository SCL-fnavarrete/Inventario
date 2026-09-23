"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Search,
  Wrench,
  Calendar,
  User,
  Package,
  Loader2,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import { etiquetaEstadoActivo } from "@/lib/constants/estadosActivo";
import { cn } from "@/lib/utils";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  estado: string;
  condicion: string;
  categoria: {
    id: string;
    nombre: string;
  };
  empleadoActual: {
    id: string;
    rut: string;
    nombres: string;
    apellidoPaterno: string;
  } | null;
};

// Maintenance types are loaded from the editable catalog, not hardcoded.
// Only active types are offered.
type TipoMantencion = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

export default function ProgramarMantencionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [tiposMantencion, setTiposMantencion] = useState<TipoMantencion[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(true);

  // The wizard's entry point is the asset, not the employee: a maintenance
  // can apply to an assigned asset or one sitting unassigned in stock.
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetSearch, setAssetSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<{ id: string; nombre: string }[]>([]);
  // Scopes the asset search to the nav's selected sede, consistent with
  // the other sections that filter by this same global selector.
  const { sedeSeleccionada } = useSedeSeleccionada();

  const [formData, setFormData] = useState({
    tipoId: "",
    descripcion: "",
    fechaProgramada: "",
    realizadoPor: "",
  });

  // Load categories + tipos once; assets se recargan tambien cuando cambia
  // la sede seleccionada en el nav.
  useEffect(() => {
    fetchCategories();
    fetchTipos();
  }, []);

  useEffect(() => {
    fetchAssets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeSeleccionada]);

  async function fetchAssets() {
    setLoadingAssets(true);
    setError("");
    setFieldErrors({});
    try {
      // No estado filter: any asset (assigned, available, in maintenance)
      // should be findable here, not just "available" ones.
      const params = new URLSearchParams({ limit: "500" });
      if (sedeSeleccionada) params.set("sedeId", sedeSeleccionada);
      const res = await fetch(`/api/activos?${params}`);
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al cargar equipos");
        setFieldErrors(fe);
        throw new Error(message);
      }
      const data = await res.json();
      setAssets(data.data || []);
    } catch (err) {
      console.error("Error fetching assets:", err);
      setError(err instanceof Error ? err.message : "Error al cargar la lista de equipos");
    } finally {
      setLoadingAssets(false);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categorias");
      if (res.ok) {
        setCategories(await res.json());
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  }

  async function fetchTipos() {
    setLoadingTipos(true);
    try {
      const res = await fetch("/api/mantenciones/tipos?activo=true");
      if (res.ok) {
        setTiposMantencion(await res.json());
      }
    } catch (err) {
      console.error("Error fetching tipos de mantención:", err);
    } finally {
      setLoadingTipos(false);
    }
  }

  // El tecnico asignado ya no se escribe a mano: siempre es quien esta
  // programando la mantencion (usuario de la sesion actual).
  useEffect(() => {
    if (session?.user?.name) {
      setFormData((prev) => ({ ...prev, realizadoPor: session.user.name as string }));
    }
  }, [session]);

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
    setFieldErrors({});
    try {
      const res = await fetch(`/api/activos/${id}`);
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Activo no encontrado");
        setFieldErrors(fe);
        throw new Error(message);
      }
      const asset = await res.json();
      setSelectedAsset(asset);
      setStep(2);
    } catch (err) {
      console.error("Error loading asset:", err);
      setError(
        err instanceof Error
          ? `${err.message}. Por favor, selecciónalo manualmente.`
          : "Error al cargar el activo. Por favor, selecciónalo manualmente."
      );
    } finally {
      setLoadingAsset(false);
    }
  }

  function handleSelectAsset(asset: Asset) {
    setSelectedAsset(asset);
    setStep(2);
  }

  // Filter assets by search term + categoria (client-side, igual que
  // SelectorActivos en Guias de Despacho).
  const filteredAssets = assets.filter((asset) => {
    const matchesSearch =
      !assetSearch.trim() ||
      (() => {
        const search = assetSearch.toLowerCase();
        return (
          asset.marca.toLowerCase().includes(search) ||
          asset.modelo.toLowerCase().includes(search) ||
          (asset.numeroSerie?.toLowerCase().includes(search) ?? false) ||
          (asset.empleadoActual
            ? `${asset.empleadoActual.nombres} ${asset.empleadoActual.apellidoPaterno}`
                .toLowerCase()
                .includes(search)
            : false)
        );
      })();

    const matchesCategory = categoryFilter === "all" || asset.categoria.id === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAsset || !formData.tipoId || !formData.descripcion || !formData.fechaProgramada) return;

    setSubmitting(true);
    setError("");
    setFieldErrors({});

    try {
      const res = await fetch("/api/mantenciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          tipoId: formData.tipoId,
          descripcion: formData.descripcion,
          fechaProgramada: formData.fechaProgramada || null,
          realizadoPor: formData.realizadoPor || null,
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al programar mantención");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      const data = await res.json();

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
          <Loader2 className="h-8 w-8 animate-spin text-primary-700 mx-auto mb-4" />
          <p className="text-fg-muted">Cargando activo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        backHref="/mantenciones"
        title="Programar Mantención"
        description="Programar una nueva mantención para un activo"
      />

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                step >= s
                  ? "bg-brand text-white"
                  : "bg-gray-200 text-fg-subtle"
              )}
            >
              {step > s ? <CheckCircle size={16} /> : s}
            </div>
            {s < 3 && (
              <div
                className={cn(
                  "w-16 h-1 mx-2",
                  step > s ? "bg-brand" : "bg-gray-200"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Asset */}
      {step === 1 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">
              1
            </span>
            Seleccionar Equipo
          </h2>

          {/* Search + category filter */}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-subtle pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por marca, modelo, serie o empleado asignado..."
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 transition-all"
              />
            </div>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none h-full pl-4 pr-9 py-3 border-2 border-line-strong rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-surface cursor-pointer"
              >
                <option value="all">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle pointer-events-none" size={16} />
            </div>
          </div>

          {error && (
            <div className="mb-4">
              <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
            </div>
          )}

          {/* Asset list */}
          {loadingAssets ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
              <span className="ml-3 text-fg-muted">Cargando equipos...</span>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-12 text-fg-subtle">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-fg-muted">
                {assetSearch || categoryFilter !== "all"
                  ? "No se encontraron equipos"
                  : "No hay equipos registrados"}
              </p>
              {(assetSearch || categoryFilter !== "all") && (
                <p className="text-sm mt-1">Intenta con otros términos de búsqueda o filtros</p>
              )}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto border border-line rounded-lg divide-y divide-line">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelectAsset(asset)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-primary-50 transition-colors text-left"
                >
                  <span className="flex-shrink-0 text-fg-subtle">
                    <CategoryIcon categoria={asset.categoria.nombre} className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-fg truncate">
                      {asset.marca} {asset.modelo}
                    </p>
                    <p className="text-sm text-fg-subtle truncate">
                      <span className="font-medium">{asset.categoria.nombre}</span>
                      {" • "}
                      <span>{asset.numeroSerie || "Sin número de serie"}</span>
                      {asset.empleadoActual && (
                        <>
                          {" • "}
                          <User className="inline h-3.5 w-3.5 -mt-0.5 mr-0.5" />
                          {asset.empleadoActual.nombres} {asset.empleadoActual.apellidoPaterno}
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <span
                      className={cn(
                        "px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap",
                        asset.estado === "disponible" &&
                          "bg-green-100 text-green-700",
                        asset.estado === "asignado" &&
                          "bg-primary-100 text-primary-800",
                        asset.estado === "en_mantencion" &&
                          "bg-orange-100 text-orange-700"
                      )}
                    >
                      {etiquetaEstadoActivo(asset.estado)}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Count info */}
          {!loadingAssets && filteredAssets.length > 0 && (
            <div className="mt-4 text-sm text-fg-subtle text-center">
              Mostrando {filteredAssets.length} equipo
              {filteredAssets.length !== 1 ? "s" : ""}
              {assetSearch || categoryFilter !== "all" ? ` de ${assets.length}` : ""}
            </div>
          )}
        </div>
      )}

      {/* Step 2: Tipo de Mantención */}
      {step === 2 && selectedAsset && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">
              2
            </span>
            Tipo de Mantención
          </h2>

          {/* Selected Asset Info */}
          <div className="mb-6 p-4 bg-surface-muted rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-fg-subtle">
                <CategoryIcon categoria={selectedAsset.categoria.nombre} className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium">
                  {selectedAsset.marca} {selectedAsset.modelo}
                </p>
                <p className="text-sm text-fg-subtle">
                  {selectedAsset.numeroSerie || "Sin serie"}
                  {selectedAsset.empleadoActual && (
                    <>
                      {" • "}
                      {selectedAsset.empleadoActual.nombres}{" "}
                      {selectedAsset.empleadoActual.apellidoPaterno}
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {loadingTipos ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
            </div>
          ) : tiposMantencion.length === 0 ? (
            <div className="text-center py-8 text-fg-subtle">
              <p className="font-medium text-fg-muted">No hay tipos de mantención configurados</p>
              <p className="text-sm mt-1">
                Crea al menos uno en la pestaña &quot;Tipos&quot; de Mantenciones antes de
                programar una.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {tiposMantencion.map((tipo) => (
                <button
                  key={tipo.id}
                  onClick={() => {
                    setFormData((prev) => ({ ...prev, tipoId: tipo.id }));
                    setStep(3);
                  }}
                  className={cn(
                    "p-4 rounded-lg border text-left transition-colors",
                    formData.tipoId === tipo.id
                      ? "border-primary-500 bg-primary-50"
                      : "border-line hover:border-primary-300 hover:bg-surface-muted"
                  )}
                >
                  <p className="font-medium">{tipo.nombre}</p>
                  {tipo.descripcion && (
                    <p className="text-sm text-fg-subtle mt-1">{tipo.descripcion}</p>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(1)}
              className={buttonClasses({ variant: "outline" })}
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Detalles de la Mantención */}
      {step === 3 && selectedAsset && formData.tipoId && (
        <form onSubmit={handleSubmit} className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-sm font-bold">
              3
            </span>
            Detalles de la Mantención
          </h2>

          {/* Summary */}
          <div className="mb-6 p-4 bg-surface-muted rounded-lg grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-fg-subtle">Activo</p>
              <p className="font-medium">
                {selectedAsset.marca} {selectedAsset.modelo}
              </p>
            </div>
            <div>
              <p className="text-sm text-fg-subtle">Tipo de Mantención</p>
              <p className="font-medium">
                {tiposMantencion.find((t) => t.id === formData.tipoId)?.nombre}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="field-label">
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
                className="field-input"
              />
            </div>

            <div>
              <label className="field-label">
                <Calendar className="inline h-4 w-4 mr-1" />
                Fecha Programada *
              </label>
              <input
                type="date"
                required
                value={formData.fechaProgramada}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, fechaProgramada: e.target.value }))
                }
                className="field-input"
              />
              <p className="text-xs text-fg-subtle mt-1">
                Obligatoria: una mantención no puede quedar &quot;en proceso&quot; sin una fecha
                programada.
              </p>
            </div>

            <div>
              <label className="field-label">
                <User className="inline h-4 w-4 mr-1" />
                Técnico Asignado
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={formData.realizadoPor}
                className="w-full px-4 py-2 border border-line bg-surface-muted text-fg-muted rounded-lg cursor-not-allowed"
              />
              <p className="text-xs text-fg-subtle mt-1">
                Se asigna automáticamente: quien está programando la mantención.
              </p>
            </div>
          </div>

          {error && (
            <div className="mt-4">
              <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className={buttonClasses({ variant: "outline" })}
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.descripcion || !formData.fechaProgramada}
              className={buttonClasses({ className: "px-6" })}
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
