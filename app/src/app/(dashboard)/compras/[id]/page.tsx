"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Trash2,
  Loader2,
  Building2,
  FileText,
  Calendar,
  DollarSign,
  Package,
  Plus,
  X,
  Search,
  AlertCircle,
  ExternalLink,
  Laptop,
  Smartphone,
  Monitor,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  precioUnitario: number | null;
  asset: Asset;
};

type Supplier = {
  id: string;
  razonSocial: string;
  rutEmpresa: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
};

type Purchase = {
  id: string;
  numeroFactura: string;
  fechaFactura: string;
  montoTotal: number | null;
  moneda: "CLP" | "USD";
  ordenCompra: string | null;
  documentoUrl: string | null;
  supplier: Supplier;
  purchaseAssets: PurchaseAsset[];
  stats: {
    cantidadActivos: number;
    montoTotalActivos: number;
  };
};

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatCurrency(amount: number | null, moneda: string): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: moneda,
  }).format(amount);
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
  reutilizable: { label: "Reutilizable", color: "text-purple-700", bgColor: "bg-purple-100" },
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
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Para agregar activos
  const [showAssetSearch, setShowAssetSearch] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);

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
          precioUnitario: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al vincular activo");
      }

      // Refrescar datos
      await fetchPurchase();
      setAssetSearch("");
      setShowAssetSearch(false);
      setAvailableAssets([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al vincular activo");
    } finally {
      setAddingAsset(false);
    }
  }

  async function removeAssetFromPurchase(assetId: string) {
    if (!confirm("¿Está seguro de desvincular este activo?")) return;

    try {
      const res = await fetch(`/api/compras/${id}/activos?assetIds=${assetId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al desvincular activo");
      }

      // Refrescar datos
      await fetchPurchase();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Error al desvincular activo");
    }
  }

  async function deletePurchase() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/compras/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al eliminar compra");
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
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error || "La compra solicitada no existe"}</p>
        </div>
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
            <p className="text-gray-600">{purchase.supplier.razonSocial}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {purchase.documentoUrl && (
            <a
              href={purchase.documentoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              <ExternalLink size={20} />
              Ver Documento
            </a>
          )}
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
          >
            <Trash2 size={20} />
            Eliminar
          </button>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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
              <dt className="text-sm text-gray-500">Monto Total</dt>
              <dd className="font-medium text-lg text-green-600">
                {formatCurrency(purchase.montoTotal, purchase.moneda)}
              </dd>
            </div>
            {purchase.ordenCompra && (
              <div>
                <dt className="text-sm text-gray-500">Orden de Compra</dt>
                <dd className="font-medium">{purchase.ordenCompra}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Datos del Proveedor */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Building2 className="h-5 w-5 text-gray-400" />
            Proveedor
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Razón Social</dt>
              <dd className="font-medium">{purchase.supplier.razonSocial}</dd>
            </div>
            {purchase.supplier.rutEmpresa && (
              <div>
                <dt className="text-sm text-gray-500">RUT</dt>
                <dd className="font-medium">{purchase.supplier.rutEmpresa}</dd>
              </div>
            )}
            {purchase.supplier.email && (
              <div>
                <dt className="text-sm text-gray-500">Email</dt>
                <dd className="font-medium">{purchase.supplier.email}</dd>
              </div>
            )}
            {purchase.supplier.telefono && (
              <div>
                <dt className="text-sm text-gray-500">Teléfono</dt>
                <dd className="font-medium">{purchase.supplier.telefono}</dd>
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
              <dt className="text-sm text-gray-500">Total Activos</dt>
              <dd className="font-medium text-lg">
                {formatCurrency(purchase.stats.montoTotalActivos, purchase.moneda)}
              </dd>
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
                    Precio Unitario
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
                      <td className="px-4 py-4 text-right font-medium">
                        {formatCurrency(pa.precioUnitario, purchase.moneda)}
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
                            onClick={() => removeAssetFromPurchase(pa.assetId)}
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
