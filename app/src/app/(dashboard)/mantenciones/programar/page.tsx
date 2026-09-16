"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Wrench,
  Calendar,
  User,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  Loader2,
  CheckCircle,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { useSedeSeleccionada } from "@/components/providers/SedeSeleccionadaProvider";

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

// Los tipos de mantencion ya no son una lista fija (9-sep-2026): se
// cargan desde /api/mantenciones/tipos, catalogo editable por admin y
// tecnico en la pestaña "Tipos" de Mantenciones. Solo se ofrecen los
// tipos activos.
type TipoMantencion = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
};

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
  const { data: session } = useSession();
  const [step, setStep] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [tiposMantencion, setTiposMantencion] = useState<TipoMantencion[]>([]);
  const [loadingTipos, setLoadingTipos] = useState(true);

  // Selección de activo (18-sep-2026, SPEC 2.52): el punto de entrada del
  // wizard es el equipo, no el empleado -- el activo principal de este
  // programa son los equipos, y una mantención puede aplicar tanto a un
  // equipo asignado como a uno en bodega sin empleado asociado.
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetSearch, setAssetSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [categories, setCategories] = useState<{ id: string; nombre: string }[]>([]);
  // Selector de sede del nav (18-sep-2026, SPEC 2.52.1): sin esto, el
  // buscador de equipos mostraba el inventario completo de todas las
  // sedes, inconsistente con Activos/Mantenciones(listado)/Solicitudes/
  // Asignaciones/Kit-EPP, que ya filtran por este mismo selector global.
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
      // limit=500: mismo tope maximo que usa /api/activos (ver comentario en
      // ese route), para poder filtrar en cliente como hace SelectorActivos.
      // Sin filtro de estado: un equipo asignado, disponible o incluso en
      // mantencion previa debe poder encontrarse aca, es el mismo listado
      // completo de inventario, no solo lo "disponible". sedeId: mismo
      // patron que el resto de las pantallas de listado (null = todas).
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

      {/* Step 1: Select Asset (18-sep-2026, SPEC 2.52) */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
              1
            </span>
            Seleccionar Equipo
          </h2>

          {/* Search + category filter */}
          <div className="mb-4 flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Buscar por marca, modelo, serie o empleado asignado..."
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
              />
            </div>
            <div className="relative">
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="appearance-none h-full pl-4 pr-9 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white cursor-pointer"
              >
                <option value="all">Todas las categorías</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
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
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
              <span className="ml-3 text-gray-600">Cargando equipos...</span>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium text-gray-700">
                {assetSearch || categoryFilter !== "all"
                  ? "No se encontraron equipos"
                  : "No hay equipos registrados"}
              </p>
              {(assetSearch || categoryFilter !== "all") && (
                <p className="text-sm mt-1">Intenta con otros términos de búsqueda o filtros</p>
              )}
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  onClick={() => handleSelectAsset(asset)}
                  className="w-full flex items-center gap-3 p-4 hover:bg-blue-50 transition-colors text-left"
                >
                  <span className="flex-shrink-0 text-gray-400">
                    {getCategoryIcon(asset.categoria.nombre)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {asset.marca} {asset.modelo}
                    </p>
                    <p className="text-sm text-gray-500 truncate">
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
                          "bg-blue-100 text-blue-700",
                        asset.estado === "en_mantencion" &&
                          "bg-orange-100 text-orange-700"
                      )}
                    >
                      {asset.estado}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Count info */}
          {!loadingAssets && filteredAssets.length > 0 && (
            <div className="mt-4 text-sm text-gray-500 text-center">
              Mostrando {filteredAssets.length} equipo
              {filteredAssets.length !== 1 ? "s" : ""}
              {assetSearch || categoryFilter !== "all" ? ` de ${assets.length}` : ""}
            </div>
          )}
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
              <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            </div>
          ) : tiposMantencion.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <p className="font-medium text-gray-700">No hay tipos de mantención configurados</p>
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
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                  )}
                >
                  <p className="font-medium">{tipo.nombre}</p>
                  {tipo.descripcion && (
                    <p className="text-sm text-gray-500 mt-1">{tipo.descripcion}</p>
                  )}
                </button>
              ))}
            </div>
          )}

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
      {step === 3 && selectedAsset && formData.tipoId && (
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
                {tiposMantencion.find((t) => t.id === formData.tipoId)?.nombre}
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
                Fecha Programada *
              </label>
              <input
                type="date"
                required
                value={formData.fechaProgramada}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, fechaProgramada: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Obligatoria: una mantención no puede quedar &quot;en proceso&quot; sin una fecha
                programada.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="inline h-4 w-4 mr-1" />
                Técnico Asignado
              </label>
              <input
                type="text"
                readOnly
                disabled
                value={formData.realizadoPor}
                className="w-full px-4 py-2 border border-gray-200 bg-gray-50 text-gray-600 rounded-lg cursor-not-allowed"
              />
              <p className="text-xs text-gray-500 mt-1">
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
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.descripcion || !formData.fechaProgramada}
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
