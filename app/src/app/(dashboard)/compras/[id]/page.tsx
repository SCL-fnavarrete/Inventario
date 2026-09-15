"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Trash2,
  Loader2,
  FileText,
  Package,
  Plus,
  X,
  Search,
  Laptop,
  Smartphone,
  Monitor,
  Eye,
  Shirt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Can } from "@/components/auth/Can";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { formatearFecha } from "@/lib/utils/fechas";

/**
 * Confirmacion pendiente (15-sep-2026, QA funcional, SPEC 2.38).
 *
 * Esta pantalla usaba `confirm()` y `alert()` del navegador, a diferencia del
 * resto del sistema, que muestra los errores en un cartel dentro de la
 * pagina (ver ApiErrorSummary, SPEC 2.37). Ademas de verse distinto, esos
 * dialogos nativos bloquean la ventana entera y no pueden mostrar el detalle
 * por campo que el backend ya devuelve.
 */
type Confirmacion = {
  titulo: string;
  mensaje: string;
  textoBoton: string;
  onConfirm: () => void | Promise<void>;
};

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  estado: string;
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

type PurchaseAsset = {
  id: string;
  assetId: string;
  asset: Asset;
};

// Kit/EPP comprado con esta factura (14-sep-2026, SPEC 2.36).
type KitItem = {
  id: string;
  nombre: string;
  categoria: "kit_bienvenida" | "epp";
  cantidad: number;
  sedeId: string | null;
};

type PurchaseKitItem = {
  id: string;
  itemId: string;
  cantidad: number;
  item: KitItem;
};

type Sede = {
  id: string;
  nombre: string;
  codigo: string;
};

type Purchase = {
  id: string;
  numeroFactura: string;
  fechaFactura: string;
  ordenCompra: string | null;
  rutProveedor: string | null;
  sede: Sede | null;
  purchaseAssets: PurchaseAsset[];
  purchaseKitItems: PurchaseKitItem[];
  stats: {
    cantidadActivos: number;
    cantidadArticulosKit: number;
  };
};

function formatDate(dateString: string): string {
  return formatearFecha(dateString, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-4 w-4" />;
    case "celular":
      return <Smartphone className="h-4 w-4" />;
    case "monitor":
      return <Monitor className="h-4 w-4" />;
    default:
      return <Package className="h-4 w-4" />;
  }
}

const estadoConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  disponible: { label: "Disponible", color: "text-green-700", bgColor: "bg-green-100" },
  asignado: { label: "Asignado", color: "text-blue-700", bgColor: "bg-blue-100" },
  en_mantencion: { label: "En Mantención", color: "text-orange-700", bgColor: "bg-orange-100" },
  baja: { label: "Baja", color: "text-red-700", bgColor: "bg-red-100" },
  vendido: { label: "Vendido", color: "text-gray-700", bgColor: "bg-gray-100" },
};

export default function CompraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  // Para agregar activos
  const [showAssetSearch, setShowAssetSearch] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);

  // Para agregar Kit/EPP (SPEC 2.36)
  const [showKitItemPicker, setShowKitItemPicker] = useState(false);
  const [kitItemsCatalogo, setKitItemsCatalogo] = useState<KitItem[]>([]);
  const [kitItemToAdd, setKitItemToAdd] = useState("");
  const [kitItemCantidad, setKitItemCantidad] = useState("1");
  const [addingKitItem, setAddingKitItem] = useState(false);

  useEffect(() => {
    fetchPurchase();
  }, [id]);

  useEffect(() => {
    if (assetSearch.length >= 2) {
      searchAssets();
    }
  }, [assetSearch]);

  async function fetchPurchase() {
    try {
      const res = await fetch(`/api/compras/${id}`);
      if (!res.ok) {
        throw new Error("Compra no encontrada");
      }
      const data = await res.json();
      setPurchase(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function searchAssets() {
    setLoadingAssets(true);
    try {
      const params = new URLSearchParams({
        search: assetSearch,
        limit: "20",
      });
      const res = await fetch(`/api/activos?${params}`);
      const data = await res.json();
      // Filter out already linked assets
      const linkedIds = new Set(purchase?.purchaseAssets.map((pa) => pa.assetId) || []);
      setAvailableAssets((data.data || []).filter((a: Asset) => !linkedIds.has(a.id)));
    } catch (error) {
      console.error("Error searching assets:", error);
    } finally {
      setLoadingAssets(false);
    }
  }

  async function addAssetToPurchase(asset: Asset) {
    setAddingAsset(true);
    try {
      const res = await fetch(`/api/compras/${id}/activos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetIds: [asset.id],
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al vincular activo");
        setFieldErrors(fe);
        throw new Error(message);
      }

      // Refrescar datos
      await fetchPurchase();
      setAssetSearch("");
      setShowAssetSearch(false);
      setAvailableAssets([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al vincular activo");
    } finally {
      setAddingAsset(false);
    }
  }

  function pedirDesvincularActivo(assetId: string) {
    setConfirmacion({
      titulo: "Desvincular activo",
      mensaje:
        "El activo se desvincula de esta factura, pero no se elimina ni cambia de estado: sigue en el inventario tal como está.",
      textoBoton: "Desvincular",
      onConfirm: () => removeAssetFromPurchase(assetId),
    });
  }

  async function removeAssetFromPurchase(assetId: string) {
    setConfirmacion(null);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/compras/${id}/activos?assetIds=${assetId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al desvincular activo");
        setFieldErrors(fe);
        throw new Error(message);
      }

      // Refrescar datos
      await fetchPurchase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al desvincular activo");
    }
  }

  async function fetchKitItemsCatalogo() {
    try {
      const params = new URLSearchParams();
      if (purchase?.sede?.id) params.set("sedeId", purchase.sede.id);
      const res = await fetch(`/api/kit-items?${params}`);
      const data = await res.json();
      setKitItemsCatalogo(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching kit items:", error);
    }
  }

  async function addKitItemToPurchase() {
    if (!kitItemToAdd) return;
    const cantidad = Math.max(1, parseInt(kitItemCantidad, 10) || 1);
    setAddingKitItem(true);
    try {
      const res = await fetch(`/api/compras/${id}/kit-items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{ itemId: kitItemToAdd, cantidad }] }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al agregar artículo de Kit/EPP");
        setFieldErrors(fe);
        throw new Error(message);
      }

      await fetchPurchase();
      setKitItemToAdd("");
      setKitItemCantidad("1");
      setShowKitItemPicker(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al agregar artículo de Kit/EPP");
    } finally {
      setAddingKitItem(false);
    }
  }

  function pedirDesvincularKitItem(lineId: string) {
    setConfirmacion({
      titulo: "Desvincular artículo de Kit/EPP",
      mensaje:
        "Se restará del stock la cantidad que esta línea había sumado. El stock nunca baja de 0, por si ya se entregó parte de lo comprado.",
      textoBoton: "Desvincular",
      onConfirm: () => removeKitItemFromPurchase(lineId),
    });
  }

  async function removeKitItemFromPurchase(lineId: string) {
    setConfirmacion(null);
    setError(null);
    setFieldErrors({});

    try {
      const res = await fetch(`/api/compras/${id}/kit-items?lineIds=${lineId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al desvincular artículo de Kit/EPP");
        setFieldErrors(fe);
        throw new Error(message);
      }

      await fetchPurchase();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al desvincular artículo de Kit/EPP");
    }
  }

  async function deletePurchase() {
    setDeleting(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/compras/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar compra");
        setError(message);
        setFieldErrors(fe);
        setDeleting(false);
        return;
      }

      router.push("/compras");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error || !purchase) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/compras"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Compra no encontrada</h1>
        </div>
        <ApiErrorSummary error={error || "La compra solicitada no existe"} fieldErrors={fieldErrors} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/compras"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Factura {purchase.numeroFactura}
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Can recurso="compras" accion="delete">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
            >
              <Trash2 size={20} />
              Eliminar
            </button>
          </Can>
        </div>
      </div>

      {/* Errores de las acciones de esta pantalla (vincular/desvincular
          activos y articulos de Kit/EPP). Antes salian en un alert() del
          navegador -- ver nota arriba, SPEC 2.38. */}
      {error && <ApiErrorSummary error={error} fieldErrors={fieldErrors} />}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Datos de la Factura */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            Datos de la Factura
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">N° Factura</dt>
              <dd className="font-medium">{purchase.numeroFactura}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Fecha</dt>
              <dd className="font-medium">{formatDate(purchase.fechaFactura)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Sede</dt>
              <dd className="font-medium">
                {purchase.sede ? purchase.sede.nombre : (
                  <span className="text-gray-400 italic">Transversal (sin sede)</span>
                )}
              </dd>
            </div>
            {purchase.rutProveedor && (
              <div>
                <dt className="text-sm text-gray-500">RUT del Proveedor</dt>
                <dd className="font-medium">{purchase.rutProveedor}</dd>
              </div>
            )}
            {purchase.ordenCompra && (
              <div>
                <dt className="text-sm text-gray-500">Orden de Compra</dt>
                <dd className="font-medium">{purchase.ordenCompra}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Resumen de Activos */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-gray-400" />
            Resumen de Activos
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Cantidad de Activos</dt>
              <dd className="font-medium text-2xl">{purchase.stats.cantidadActivos}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Artículos de Kit/EPP</dt>
              <dd className="font-medium text-2xl">{purchase.stats.cantidadArticulosKit}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Activos Vinculados */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Package className="h-5 w-5 text-gray-400" />
            Activos Vinculados ({purchase.purchaseAssets.length})
          </h2>
          <button
            onClick={() => setShowAssetSearch(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
          >
            <Plus size={16} />
            Agregar Activo
          </button>
        </div>

        {/* Búsqueda de activos */}
        {showAssetSearch && (
          <div className="p-4 bg-gray-50 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Buscar activo por serie, marca, modelo..."
                autoFocus
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="button"
                onClick={() => {
                  setShowAssetSearch(false);
                  setAssetSearch("");
                  setAvailableAssets([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={20} />
              </button>
            </div>

            {loadingAssets && (
              <div className="mt-2 flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
              </div>
            )}

            {!loadingAssets && availableAssets.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-gray-200 rounded-lg bg-white">
                {availableAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => addAssetToPurchase(asset)}
                    disabled={addingAsset}
                    className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between border-b last:border-b-0 disabled:opacity-50"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {asset.marca} {asset.modelo}
                      </p>
                      <p className="text-xs text-gray-500">
                        {asset.categoria.nombre} • {asset.numeroSerie || "Sin serie"}
                      </p>
                    </div>
                    {addingAsset ? (
                      <Loader2 size={18} className="animate-spin text-blue-600" />
                    ) : (
                      <Plus size={18} className="text-blue-600" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {purchase.purchaseAssets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Activo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Serie
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Estado
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Asignado a
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {purchase.purchaseAssets.map((pa) => {
                  const config = estadoConfig[pa.asset.estado] || estadoConfig.disponible;
                  return (
                    <tr key={pa.id} className="hover:bg-gray-50">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-gray-400">
                            {getCategoryIcon(pa.asset.categoria.nombre)}
                          </span>
                          <div>
                            <p className="font-medium text-sm">
                              {pa.asset.marca} {pa.asset.modelo}
                            </p>
                            <p className="text-xs text-gray-500">
                              {pa.asset.categoria.nombre}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {pa.asset.numeroSerie || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={cn(
                            "inline-flex px-2 py-1 text-xs font-medium rounded-full",
                            config.bgColor,
                            config.color
                          )}
                        >
                          {config.label}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {pa.asset.empleadoActual ? (
                          <Link
                            href={`/empleados/${pa.asset.empleadoActual.id}`}
                            className="text-blue-600 hover:text-blue-800"
                          >
                            {pa.asset.empleadoActual.nombres} {pa.asset.empleadoActual.apellidoPaterno}
                          </Link>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/activos/${pa.assetId}`}
                            className="p-1.5 text-gray-400 hover:text-blue-600"
                            title="Ver activo"
                          >
                            <Eye size={18} />
                          </Link>
                          <button
                            onClick={() => pedirDesvincularActivo(pa.assetId)}
                            className="p-1.5 text-gray-400 hover:text-red-600"
                            title="Desvincular"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No hay activos vinculados</p>
            <button
              onClick={() => setShowAssetSearch(true)}
              className="mt-4 text-blue-600 hover:text-blue-800 text-sm"
            >
              Vincular primer activo
            </button>
          </div>
        )}
      </div>

      {/* Kit/EPP Vinculados (14-sep-2026, SPEC 2.36) */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Shirt className="h-5 w-5 text-gray-400" />
            Kit de Bienvenida / EPP Comprado ({purchase.purchaseKitItems.length})
          </h2>
          <button
            onClick={() => {
              setShowKitItemPicker(true);
              fetchKitItemsCatalogo();
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
          >
            <Plus size={16} />
            Agregar Artículo
          </button>
        </div>

        {showKitItemPicker && (
          <div className="p-4 bg-gray-50 border-b flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Artículo</label>
              <select
                value={kitItemToAdd}
                onChange={(e) => setKitItemToAdd(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Selecciona un artículo...</option>
                {kitItemsCatalogo.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} ({item.categoria === "epp" ? "EPP" : "Kit Bienvenida"}) -- stock actual: {item.cantidad}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-full sm:w-28">
              <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                value={kitItemCantidad}
                onChange={(e) => setKitItemCantidad(e.target.value)}
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={addKitItemToPurchase}
              disabled={!kitItemToAdd || addingKitItem}
              className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {addingKitItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
              Agregar
            </button>
            <button
              type="button"
              onClick={() => setShowKitItemPicker(false)}
              className="p-1.5 text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {purchase.purchaseKitItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Artículo
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cantidad comprada
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Stock actual del artículo
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {purchase.purchaseKitItems.map((pk) => (
                  <tr key={pk.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Shirt className="h-4 w-4 text-gray-400" />
                        <div>
                          <p className="font-medium text-sm">{pk.item.nombre}</p>
                          <p className="text-xs text-gray-500">
                            {pk.item.categoria === "epp" ? "EPP" : "Kit Bienvenida"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-700">+{pk.cantidad}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">{pk.item.cantidad}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => pedirDesvincularKitItem(pk.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                        title="Desvincular"
                      >
                        <X size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <Shirt className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No hay artículos de Kit/EPP vinculados</p>
            <button
              onClick={() => {
                setShowKitItemPicker(true);
                fetchKitItemsCatalogo();
              }}
              className="mt-4 text-blue-600 hover:text-blue-800 text-sm"
            >
              Vincular primer artículo
            </button>
          </div>
        )}
      </div>

      {/* Confirmacion de desvincular activo / articulo de Kit/EPP. Mismo
          formato que el modal de eliminar factura de mas abajo, en vez del
          confirm() del navegador que usaba antes (SPEC 2.38). */}
      {confirmacion && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {confirmacion.titulo}
            </h3>
            <p className="text-gray-600 mb-4">{confirmacion.mensaje}</p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmacion(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={() => confirmacion.onConfirm()}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                {confirmacion.textoBoton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmación de eliminación */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              Eliminar Compra
            </h3>
            <p className="text-gray-600 mb-4">
              ¿Está seguro de eliminar la factura <strong>{purchase.numeroFactura}</strong>?
              {purchase.purchaseAssets.length > 0 && (
                <span className="block mt-2 text-orange-600">
                  Se desvinculará de {purchase.purchaseAssets.length} activo(s).
                </span>
              )}
              {purchase.purchaseKitItems.length > 0 && (
                <span className="block mt-2 text-orange-600">
                  Se revertirá el stock sumado por {purchase.purchaseKitItems.length} artículo(s) de Kit/EPP.
                </span>
              )}
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={deletePurchase}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Eliminando...
                  </>
                ) : (
                  <>
                    <Trash2 size={18} />
                    Eliminar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
