"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
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
} from "lucide-react";
import { cn } from "@/lib/utils";

type Supplier = {
  id: string;
  razonSocial: string;
  rutEmpresa: string | null;
};

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  categoria: {
    nombre: string;
  };
};

type SelectedAsset = {
  assetId: string;
  asset: Asset;
  precioUnitario: number | null;
};

export default function NuevaCompraPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [showAssetSearch, setShowAssetSearch] = useState(false);

  // Form data
  const [formData, setFormData] = useState({
    supplierId: "",
    numeroFactura: "",
    fechaFactura: new Date().toISOString().split("T")[0],
    montoTotal: "",
    moneda: "CLP" as "CLP" | "USD",
    ordenCompra: "",
    documentoUrl: "",
  });

  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  useEffect(() => {
    if (assetSearch.length >= 2) {
      searchAssets();
    }
  }, [assetSearch]);

  async function fetchSuppliers() {
    try {
      const res = await fetch("/api/proveedores?limit=100");
      const data = await res.json();
      setSuppliers(data.data || []);
    } catch (error) {
      console.error("Error fetching suppliers:", error);
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
      // Filter out already selected assets
      const selectedIds = new Set(selectedAssets.map((a) => a.assetId));
      setAvailableAssets((data.data || []).filter((a: Asset) => !selectedIds.has(a.id)));
    } catch (error) {
      console.error("Error searching assets:", error);
    } finally {
      setLoadingAssets(false);
    }
  }

  function addAsset(asset: Asset) {
    setSelectedAssets((prev) => [
      ...prev,
      {
        assetId: asset.id,
        asset,
        precioUnitario: null,
      },
    ]);
    setAssetSearch("");
    setShowAssetSearch(false);
    setAvailableAssets([]);
  }

  function removeAsset(assetId: string) {
    setSelectedAssets((prev) => prev.filter((a) => a.assetId !== assetId));
  }

  function updateAssetPrice(assetId: string, price: string) {
    setSelectedAssets((prev) =>
      prev.map((a) =>
        a.assetId === assetId
          ? { ...a, precioUnitario: price ? parseFloat(price) : null }
          : a
      )
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        supplierId: formData.supplierId,
        numeroFactura: formData.numeroFactura,
        fechaFactura: formData.fechaFactura,
        montoTotal: formData.montoTotal ? parseFloat(formData.montoTotal) : null,
        moneda: formData.moneda,
        ordenCompra: formData.ordenCompra || null,
        documentoUrl: formData.documentoUrl || null,
        assets: selectedAssets.map((a) => ({
          assetId: a.assetId,
          precioUnitario: a.precioUnitario,
        })),
      };

      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al crear la compra");
      }

      const purchase = await res.json();
      router.push(`/compras/${purchase.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

  const totalActivos = selectedAssets.reduce(
    (sum, a) => sum + (a.precioUnitario || 0),
    0
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/compras"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Compra</h1>
          <p className="text-gray-600">Registrar factura y vincular activos</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos de la factura */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            Datos de la Factura
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Proveedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Proveedor <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.supplierId}
                onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Seleccionar proveedor</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.razonSocial} {supplier.rutEmpresa ? `(${supplier.rutEmpresa})` : ""}
                  </option>
                ))}
              </select>
              <Link
                href="/configuracion/proveedores"
                className="text-xs text-blue-600 hover:text-blue-800 mt-1 inline-block"
              >
                + Agregar nuevo proveedor
              </Link>
            </div>

            {/* Número de Factura */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                N° Factura <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.numeroFactura}
                onChange={(e) => setFormData({ ...formData, numeroFactura: e.target.value })}
                required
                placeholder="Ej: F-00123456"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Fecha Factura */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha Factura <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={formData.fechaFactura}
                onChange={(e) => setFormData({ ...formData, fechaFactura: e.target.value })}
                required
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Orden de Compra */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Orden de Compra
              </label>
              <input
                type="text"
                value={formData.ordenCompra}
                onChange={(e) => setFormData({ ...formData, ordenCompra: e.target.value })}
                placeholder="Ej: OC-2024-001"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Moneda */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Moneda
              </label>
              <select
                value={formData.moneda}
                onChange={(e) => setFormData({ ...formData, moneda: e.target.value as "CLP" | "USD" })}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="CLP">CLP (Peso Chileno)</option>
                <option value="USD">USD (Dólar)</option>
              </select>
            </div>

            {/* Monto Total */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monto Total
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                  {formData.moneda === "CLP" ? "$" : "US$"}
                </span>
                <input
                  type="number"
                  value={formData.montoTotal}
                  onChange={(e) => setFormData({ ...formData, montoTotal: e.target.value })}
                  placeholder="0"
                  min="0"
                  step="0.01"
                  className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* URL Documento */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL del Documento (PDF)
              </label>
              <input
                type="url"
                value={formData.documentoUrl}
                onChange={(e) => setFormData({ ...formData, documentoUrl: e.target.value })}
                placeholder="https://..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Vincular Activos */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Package className="h-5 w-5 text-gray-400" />
              Activos Vinculados
            </h2>
            <button
              type="button"
              onClick={() => setShowAssetSearch(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
            >
              <Plus size={16} />
              Agregar Activo
            </button>
          </div>

          {/* Búsqueda de activos */}
          {showAssetSearch && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
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
                      onClick={() => addAsset(asset)}
                      className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between border-b last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-sm">
                          {asset.marca} {asset.modelo}
                        </p>
                        <p className="text-xs text-gray-500">
                          {asset.categoria.nombre} • {asset.numeroSerie || "Sin serie"}
                        </p>
                      </div>
                      <Plus size={18} className="text-blue-600" />
                    </button>
                  ))}
                </div>
              )}

              {!loadingAssets && assetSearch.length >= 2 && availableAssets.length === 0 && (
                <p className="mt-2 text-sm text-gray-500 text-center py-4">
                  No se encontraron activos
                </p>
              )}
            </div>
          )}

          {/* Lista de activos seleccionados */}
          {selectedAssets.length > 0 ? (
            <div className="space-y-2">
              {selectedAssets.map((item) => (
                <div
                  key={item.assetId}
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {item.asset.marca} {item.asset.modelo}
                    </p>
                    <p className="text-xs text-gray-500">
                      {item.asset.categoria.nombre} • {item.asset.numeroSerie || "Sin serie"}
                    </p>
                  </div>
                  <div className="w-40">
                    <input
                      type="number"
                      value={item.precioUnitario || ""}
                      onChange={(e) => updateAssetPrice(item.assetId, e.target.value)}
                      placeholder="Precio unitario"
                      min="0"
                      step="0.01"
                      className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeAsset(item.assetId)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}

              <div className="flex justify-between items-center pt-4 border-t mt-4">
                <span className="text-sm text-gray-500">
                  {selectedAssets.length} activo(s) seleccionado(s)
                </span>
                {totalActivos > 0 && (
                  <span className="text-sm font-medium text-gray-700">
                    Total: {new Intl.NumberFormat("es-CL", {
                      style: "currency",
                      currency: formData.moneda,
                    }).format(totalActivos)}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay activos vinculados</p>
              <p className="text-xs text-gray-400 mt-1">
                Puedes vincular activos ahora o después
              </p>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex items-center justify-end gap-4">
          <Link
            href="/compras"
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving || !formData.supplierId || !formData.numeroFactura}
            className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save size={20} />
                Guardar Compra
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
