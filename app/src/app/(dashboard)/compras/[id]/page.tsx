"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
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
  Eye,
  Shirt,
  Pencil } from "lucide-react";
import { Can } from "@/components/auth/Can";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { formatearFechaLarga } from "@/lib/utils/fechas";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { ETIQUETAS_FACTURA, validarDatosFactura } from "@/lib/validations/purchase";
import { CamposFactura } from "@/components/compras/CamposFactura";

/**
 * Confirmacion en modal propio, en vez de confirm()/alert() del navegador:
 * permite mostrar el detalle por campo que devuelve el backend, igual que
 * ApiErrorSummary en el resto del sistema.
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

// Kit/EPP comprado con esta factura.
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


export default function CompraDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  // Solo admin puede elegir la sede.
  const esAdminSede = session?.user?.role === "admin";
  const [purchase, setPurchase] = useState<Purchase | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  // Permite corregir los datos de la factura sin eliminarla y rehacerla.
  const [showEditForm, setShowEditForm] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sedes, setSedes] = useState<{ id: string; nombre: string }[]>([]);
  const [editForm, setEditForm] = useState({
    numeroFactura: "",
    fechaFactura: "",
    rutProveedor: "",
    ordenCompra: "",
    sedeId: "",
  });

  // Para agregar activos
  const [showAssetSearch, setShowAssetSearch] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [addingAsset, setAddingAsset] = useState(false);

  // Para agregar Kit/EPP
  const [showKitItemPicker, setShowKitItemPicker] = useState(false);
  const [kitItemsCatalogo, setKitItemsCatalogo] = useState<KitItem[]>([]);
  const [kitItemToAdd, setKitItemToAdd] = useState("");
  const [kitItemCantidad, setKitItemCantidad] = useState("1");
  const [addingKitItem, setAddingKitItem] = useState(false);

  // Validacion por campo de la factura y del articulo a agregar (SPEC 2.103).
  const { errores, resumen, reportar, reportarServidor, limpiar } =
    useErroresFormulario(ETIQUETAS_FACTURA);

  const fetchPurchase = useCallback(async () => {
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
  }, [id]);

  function abrirEdicion() {
    if (!purchase) return;
    setEditForm({
      numeroFactura: purchase.numeroFactura || "",
      // El <input type="date"> necesita yyyy-mm-dd, no el ISO completo.
      fechaFactura: purchase.fechaFactura ? purchase.fechaFactura.slice(0, 10) : "",
      rutProveedor: purchase.rutProveedor || "",
      ordenCompra: purchase.ordenCompra || "",
      sedeId: purchase.sede?.id || "",
    });
    setError(null);
    setFieldErrors({});
    reportar({});
    setShowEditForm(true);
    if (sedes.length === 0) fetchSedes();
  }

  async function fetchSedes() {
    try {
      const res = await fetch("/api/sedes?activas=true");
      const data = await res.json();
      setSedes(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error fetching sedes:", err);
    }
  }

  async function guardarEdicion(e: React.FormEvent) {
    e.preventDefault();
    if (reportar(validarDatosFactura(editForm))) return;
    setSavingEdit(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/compras/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          numeroFactura: editForm.numeroFactura,
          fechaFactura: editForm.fechaFactura,
          rutProveedor: editForm.rutProveedor || null,
          ordenCompra: editForm.ordenCompra || null,
          sedeId: editForm.sedeId || undefined,
        }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al guardar los cambios");
        if (!reportarServidor(fe)) setError(message);
        return;
      }
      setShowEditForm(false);
      await fetchPurchase();
    } catch (err) {
      console.error("Error updating purchase:", err);
      setError("Error al guardar los cambios");
    } finally {
      setSavingEdit(false);
    }
  }

  const searchAssets = useCallback(async () => {
    setLoadingAssets(true);
    try {
      // Acotado a la sede de la compra, igual que el catalogo de Kit/EPP
      // de mas abajo.
      const params = new URLSearchParams({
        search: assetSearch,
        limit: "20",
      });
      if (purchase?.sede?.id) params.set("sedeId", purchase.sede.id);
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
  }, [assetSearch, purchase]);

  useEffect(() => {
    fetchPurchase();
  }, [fetchPurchase]);

  useEffect(() => {
    if (assetSearch.length >= 2) {
      searchAssets();
    }
  }, [assetSearch, searchAssets]);

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
    if (reportar(kitItemToAdd ? {} : { kitItem: "Elige un artículo" })) return;
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
        <Loader2 className="h-8 w-8 animate-spin text-fg-subtle" />
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
          <h1 className="text-2xl font-bold text-fg">Compra no encontrada</h1>
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
            <h1 className="text-2xl font-bold text-fg">
              Factura {purchase.numeroFactura}
            </h1>
          </div>
        </div>
        <div className="flex gap-2">
          <Can recurso="compras">
            <button
              onClick={abrirEdicion}
              className={buttonClasses({ variant: "outline" })}
            >
              <Pencil size={20} />
              Editar
            </button>
          </Can>
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
          activos y articulos de Kit/EPP). */}
      {error && <ApiErrorSummary error={error} fieldErrors={fieldErrors} />}

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Datos de la Factura */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-fg-subtle" />
            Datos de la Factura
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-fg-subtle">N° Factura</dt>
              <dd className="font-medium">{purchase.numeroFactura}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Fecha</dt>
              <dd className="font-medium">{formatearFechaLarga(purchase.fechaFactura)}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Sede</dt>
              <dd className="font-medium">
                {purchase.sede ? purchase.sede.nombre : (
                  <span className="text-fg-subtle italic">Transversal (sin sede)</span>
                )}
              </dd>
            </div>
            {purchase.rutProveedor && (
              <div>
                <dt className="text-sm text-fg-subtle">RUT del Proveedor</dt>
                <dd className="font-medium">{purchase.rutProveedor}</dd>
              </div>
            )}
            {purchase.ordenCompra && (
              <div>
                <dt className="text-sm text-fg-subtle">Orden de Compra</dt>
                <dd className="font-medium">{purchase.ordenCompra}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Resumen de Activos */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <Package className="h-5 w-5 text-fg-subtle" />
            Resumen de Activos
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-fg-subtle">Cantidad de Activos</dt>
              <dd className="font-medium text-2xl">{purchase.stats.cantidadActivos}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Artículos de Kit/EPP</dt>
              <dd className="font-medium text-2xl">{purchase.stats.cantidadArticulosKit}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Activos Vinculados */}
      <div className="card">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
            <Package className="h-5 w-5 text-fg-subtle" />
            Activos Vinculados ({purchase.purchaseAssets.length})
          </h2>
          <button
            onClick={() => setShowAssetSearch(true)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100"
          >
            <Plus size={16} />
            Agregar Activo
          </button>
        </div>

        {/* Búsqueda de activos */}
        {showAssetSearch && (
          <div className="p-4 bg-surface-muted border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-fg-subtle" />
              <input
                type="text"
                value={assetSearch}
                onChange={(e) => setAssetSearch(e.target.value)}
                placeholder="Buscar activo por serie, marca, modelo..."
                autoFocus
                className="field-input pl-10 pr-4"
              />
              <button
                type="button"
                onClick={() => {
                  setShowAssetSearch(false);
                  setAssetSearch("");
                  setAvailableAssets([]);
                }}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-subtle hover:text-fg-muted"
              >
                <X size={20} />
              </button>
            </div>

            {loadingAssets && (
              <div className="mt-2 flex items-center justify-center py-4">
                <Loader2 className="h-5 w-5 animate-spin text-fg-subtle" />
              </div>
            )}

            {!loadingAssets && availableAssets.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto border border-line rounded-lg bg-surface">
                {availableAssets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={() => addAssetToPurchase(asset)}
                    disabled={addingAsset}
                    className="w-full px-4 py-2 text-left hover:bg-surface-muted flex items-center justify-between border-b last:border-b-0 disabled:opacity-50"
                  >
                    <div>
                      <p className="font-medium text-sm">
                        {asset.marca} {asset.modelo}
                      </p>
                      <p className="text-xs text-fg-subtle">
                        {asset.categoria.nombre} • {asset.numeroSerie || "Sin serie"}
                      </p>
                    </div>
                    {addingAsset ? (
                      <Loader2 size={18} className="animate-spin text-primary-700" />
                    ) : (
                      <Plus size={18} className="text-primary-700" />
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
              <thead className="bg-surface-muted border-b">
                <tr>
                  <th className="table-th px-4">
                    Activo
                  </th>
                  <th className="table-th px-4">
                    Serie
                  </th>
                  <th className="table-th px-4">
                    Estado
                  </th>
                  <th className="table-th px-4">
                    Asignado a
                  </th>
                  <th className="table-th px-4 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {purchase.purchaseAssets.map((pa) => {
                  return (
                    <tr key={pa.id} className="hover:bg-surface-muted">
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="text-fg-subtle">
                            <CategoryIcon categoria={pa.asset.categoria.nombre} className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="font-medium text-sm">
                              {pa.asset.marca} {pa.asset.modelo}
                            </p>
                            <p className="text-xs text-fg-subtle">
                              {pa.asset.categoria.nombre}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-sm text-fg-subtle">
                        {pa.asset.numeroSerie || "-"}
                      </td>
                      <td className="px-4 py-4">
                        <AssetStatusBadge status={pa.asset.estado} size="sm" />
                      </td>
                      <td className="px-4 py-4 text-sm text-fg-subtle">
                        {pa.asset.empleadoActual ? (
                          <Link
                            href={`/empleados/${pa.asset.empleadoActual.id}`}
                            className="text-primary-700 hover:text-primary-900"
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
                            className="p-1.5 text-fg-subtle hover:text-primary-700"
                            title="Ver activo"
                          >
                            <Eye size={18} />
                          </Link>
                          <button
                            onClick={() => pedirDesvincularActivo(pa.assetId)}
                            className="p-1.5 text-fg-subtle hover:text-red-600"
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
          <div className="text-center py-12 text-fg-subtle">
            <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No hay activos vinculados</p>
            <button
              onClick={() => setShowAssetSearch(true)}
              className="mt-4 text-primary-700 hover:text-primary-900 text-sm"
            >
              Vincular primer activo
            </button>
          </div>
        )}
      </div>

      {/* Kit/EPP Vinculados */}
      <div className="card">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
            <Shirt className="h-5 w-5 text-fg-subtle" />
            Kit de Bienvenida / EPP Comprado ({purchase.purchaseKitItems.length})
          </h2>
          <button
            onClick={() => {
              setShowKitItemPicker(true);
              fetchKitItemsCatalogo();
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100"
          >
            <Plus size={16} />
            Agregar Artículo
          </button>
        </div>

        {showKitItemPicker && (
          <div className="p-4 bg-surface-muted border-b flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-fg-muted mb-1">Artículo</label>
              <select
                value={kitItemToAdd}
                onChange={(e) => {
                  setKitItemToAdd(e.target.value);
                  limpiar("kitItem");
                }}
                aria-invalid={!!errores.kitItem}
                className={claseCampo(errores.kitItem) + " field-input-sm"}
              >
                <option value="">Selecciona un artículo...</option>
                {kitItemsCatalogo.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nombre} ({item.categoria === "epp" ? "EPP" : "Kit Bienvenida"}) -- stock actual: {item.cantidad}
                  </option>
                ))}
              </select>
              {errores.kitItem && <p className="mt-1 text-xs text-red-600">{errores.kitItem}</p>}
            </div>
            <div className="w-full sm:w-28">
              <label className="block text-xs font-medium text-fg-muted mb-1">Cantidad</label>
              <input
                type="number"
                min={1}
                value={kitItemCantidad}
                onChange={(e) => setKitItemCantidad(e.target.value)}
                className="field-input field-input-sm"
              />
            </div>
            <button
              type="button"
              onClick={addKitItemToPurchase}
              disabled={addingKitItem}
              className={buttonClasses({ size: "sm" })}
            >
              {addingKitItem ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus size={16} />}
              Agregar
            </button>
            <button
              type="button"
              onClick={() => setShowKitItemPicker(false)}
              className="p-1.5 text-fg-subtle hover:text-fg-muted"
            >
              <X size={20} />
            </button>
          </div>
        )}

        {purchase.purchaseKitItems.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-surface-muted border-b">
                <tr>
                  <th className="table-th px-4">
                    Artículo
                  </th>
                  <th className="table-th px-4">
                    Cantidad comprada
                  </th>
                  <th className="table-th px-4">
                    Stock actual del artículo
                  </th>
                  <th className="table-th px-4 text-right">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {purchase.purchaseKitItems.map((pk) => (
                  <tr key={pk.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <Shirt className="h-4 w-4 text-fg-subtle" />
                        <div>
                          <p className="font-medium text-sm">{pk.item.nombre}</p>
                          <p className="text-xs text-fg-subtle">
                            {pk.item.categoria === "epp" ? "EPP" : "Kit Bienvenida"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-fg-muted">+{pk.cantidad}</td>
                    <td className="px-4 py-4 text-sm text-fg-subtle">{pk.item.cantidad}</td>
                    <td className="px-4 py-4 text-right">
                      <button
                        onClick={() => pedirDesvincularKitItem(pk.id)}
                        className="p-1.5 text-fg-subtle hover:text-red-600"
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
          <div className="text-center py-12 text-fg-subtle">
            <Shirt className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No hay artículos de Kit/EPP vinculados</p>
            <button
              onClick={() => {
                setShowKitItemPicker(true);
                fetchKitItemsCatalogo();
              }}
              className="mt-4 text-primary-700 hover:text-primary-900 text-sm"
            >
              Vincular primer artículo
            </button>
          </div>
        )}
      </div>

      {/* Confirmacion de desvincular activo / articulo de Kit/EPP. Mismo
          formato que el modal de eliminar factura de mas abajo. */}
      <ConfirmDialog
        isOpen={confirmacion !== null}
        onClose={() => setConfirmacion(null)}
        onConfirm={() => confirmacion?.onConfirm()}
        variant="danger"
        title={confirmacion?.titulo ?? ""}
        message={confirmacion?.mensaje}
        confirmLabel={confirmacion?.textoBoton}
      />

      {/* Modal de confirmación de eliminación */}
      {/* Editar datos de la factura */}
      {showEditForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-lg font-semibold mb-4">Editar datos de la factura</h3>
            <form onSubmit={guardarEdicion} className="space-y-4" noValidate>
              <ResumenErrores mensaje={resumen} />
              <CamposFactura
                valores={editForm}
                errores={errores}
                onChange={(campo, valor) => {
                  setEditForm((prev) => ({ ...prev, [campo]: valor }));
                  limpiar(campo);
                }}
                sedes={sedes}
                puedeElegirSede={esAdminSede}
                ayudaSede={
                  esAdminSede
                    ? "Cambiar la sede no mueve los equipos ya vinculados: cada uno conserva la suya."
                    : "Mover una compra de sede es solo de admin."
                }
              />

              {error && <ApiErrorSummary error={error} fieldErrors={fieldErrors} />}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditForm(false)}
                  className={buttonClasses({ variant: "outline" })}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className={buttonClasses()}
                >
                  {savingEdit && <Loader2 className="h-4 w-4 animate-spin" />}
                  Guardar cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-fg mb-2">
              Eliminar Compra
            </h3>
            <p className="text-fg-muted mb-4">
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
                className={buttonClasses({ variant: "outline" })}
              >
                Cancelar
              </button>
              <button
                onClick={deletePurchase}
                disabled={deleting}
                className={buttonClasses({ variant: "danger" })}
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
