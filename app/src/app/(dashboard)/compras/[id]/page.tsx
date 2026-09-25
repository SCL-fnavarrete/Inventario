"use client";

import { useState, useEffect, useCallback, use } from "react";
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
  Eye,
  Shirt,
  Pencil,
  PackagePlus,
  Split,
  Truck,
  CheckCircle } from "lucide-react";
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
import { Modal } from "@/components/ui/Modal";
import {
  ACTIVO_FORM_VACIO,
  ActivoForm,
  payloadActivo,
  type ActivoFormValues,
} from "@/components/activos/ActivoForm";
import {
  ESTADO_REPARTO_BADGE,
  ESTADO_REPARTO_LABEL,
  type AvanceReparto,
} from "@/lib/constants/repartoCompra";
import { cn } from "@/lib/utils";
import { VentanaReparto } from "@/components/compras/VentanaReparto";
import { ESTADO_GUIA_COLORS, ESTADO_GUIA_LABELS } from "@/types/guia-despacho";
import type { EstadoGuia } from "@prisma/client";

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
  sede?: { id: string; nombre: string } | null;
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
  // SPEC 2.111: comprado en esta compra (pasa por el reparto) o equipo que
  // ya existia y solo se vinculo a la factura.
  llegoConCompra: boolean;
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
  // Unidades que todavia no se reparten (SPEC 2.111).
  cantidadPorRepartir: number;
  item: KitItem;
  // A donde se repartio cada parte.
  repartos: {
    id: string;
    cantidad: number;
    sede: { id: string; nombre: string };
    guide: { id: string; numero: string; estado: EstadoGuia } | null;
  }[];
};

// Despacho creado al repartir a otra sede.
type DespachoReparto = {
  id: string;
  numero: string;
  estado: EstadoGuia;
  fechaDespacho: string;
  sedeDestino: { id: string; nombre: string };
  _count: { items: number; kitItems: number };
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
  reparto: AvanceReparto;
  despachos: DespachoReparto[];
  stats: {
    cantidadActivos: number;
    cantidadArticulosKit: number;
  };
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

  // Repartir a una sede (SPEC 2.111.3), y el aviso de lo ultimo repartido.
  const [showReparto, setShowReparto] = useState(false);
  const [avisoReparto, setAvisoReparto] = useState<{ texto: string; despacho?: { id: string; numero: string } } | null>(
    null
  );

  // Equipo comprado (SPEC 2.111): el formulario de Activos en una ventana;
  // nace "Por repartir" en la sede de llegada.
  const [showNewAssetForm, setShowNewAssetForm] = useState(false);
  const [newAssetError, setNewAssetError] = useState<string | null>(null);
  const [newAssetFieldErrors, setNewAssetFieldErrors] = useState<FieldErrors>({});

  // Para vincular un equipo que ya existia
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

  async function agregarEquipoComprado(values: ActivoFormValues) {
    setNewAssetError(null);
    setNewAssetFieldErrors({});
    try {
      const res = await fetch(`/api/compras/${id}/activos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equiposNuevos: [payloadActivo(values, "crear")] }),
      });
      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al agregar el equipo");
        setNewAssetError(message);
        setNewAssetFieldErrors(fe);
        return;
      }
      setShowNewAssetForm(false);
      await fetchPurchase();
    } catch (err) {
      setNewAssetError(err instanceof Error ? err.message : "Error al agregar el equipo");
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

  function pedirDesvincularActivo(pa: PurchaseAsset) {
    setConfirmacion(
      pa.llegoConCompra
        ? {
            titulo: "Quitar equipo de la compra",
            mensaje:
              "El equipo todavía no se reparte: se quita de la compra y se descarta del inventario. Su registro queda en el historial.",
            textoBoton: "Quitar",
            onConfirm: () => removeAssetFromPurchase(pa.assetId),
          }
        : {
            titulo: "Desvincular equipo",
            mensaje:
              "El equipo se desvincula de esta factura, pero no se elimina ni cambia de estado: sigue en el inventario tal como está.",
            textoBoton: "Desvincular",
            onConfirm: () => removeAssetFromPurchase(pa.assetId),
          }
    );
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
      titulo: "Quitar artículo de Kit/EPP",
      mensaje:
        "La línea se quita de la compra. Todavía no se había repartido, así que no sumó stock y el stock no cambia.",
      textoBoton: "Quitar",
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

  // Algo ya se repartio: la compra no se elimina ni cambia de sede de llegada.
  const seRepartio = purchase.reparto.repartido > 0;

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
            <h1 className="text-2xl font-bold text-fg flex flex-wrap items-center gap-3">
              Factura {purchase.numeroFactura}
              {purchase.reparto.estado && (
                <span
                  className={cn(
                    "rounded-full border px-3 py-1 text-sm font-medium",
                    ESTADO_REPARTO_BADGE[purchase.reparto.estado]
                  )}
                >
                  {ESTADO_REPARTO_LABEL[purchase.reparto.estado]}
                </span>
              )}
            </h1>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {purchase.reparto.pendiente > 0 && (
            <Can recurso="compras">
              <button
                onClick={() => {
                  setAvisoReparto(null);
                  if (sedes.length === 0) fetchSedes();
                  setShowReparto(true);
                }}
                className={buttonClasses()}
              >
                <Split size={20} />
                Repartir
              </button>
            </Can>
          )}
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
              disabled={seRepartio}
              title={
                seRepartio
                  ? "Ya se repartió parte de lo comprado: la compra es el comprobante y no se elimina"
                  : undefined
              }
              className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
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

      {avisoReparto && (
        <div className="flex gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
          <CheckCircle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm">
            {avisoReparto.texto}
            {avisoReparto.despacho && (
              <>
                {" "}
                <Link href={`/despachos/${avisoReparto.despacho.id}`} className="font-medium underline">
                  Ver despacho {avisoReparto.despacho.numero}
                </Link>
              </>
            )}
          </p>
        </div>
      )}

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
              <dt className="text-sm text-fg-subtle">Sede de llegada</dt>
              <dd className="font-medium">{purchase.sede?.nombre ?? "-"}</dd>
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
            Reparto
          </h2>
          <dl className="grid grid-cols-2 gap-3">
            <div>
              <dt className="text-sm text-fg-subtle">Por repartir</dt>
              <dd className="font-medium text-2xl text-purple-700">{purchase.reparto.pendiente}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Repartido</dt>
              <dd className="font-medium text-2xl">{purchase.reparto.repartido}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Equipos</dt>
              <dd className="font-medium">{purchase.stats.cantidadActivos}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Líneas de Kit/EPP</dt>
              <dd className="font-medium">{purchase.stats.cantidadArticulosKit}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-fg-subtle">
            En unidades: cada equipo cuenta 1 y el Kit/EPP cuenta su cantidad. Lo comprado espera en{" "}
            {purchase.sede?.nombre ?? "la sede de llegada"} hasta que se reparte a las sedes.
          </p>
        </div>
      </div>

      {/* Activos Vinculados */}
      <div className="card">
        <div className="p-6 border-b flex items-center justify-between">
          <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
            <Package className="h-5 w-5 text-fg-subtle" />
            Equipos ({purchase.purchaseAssets.length})
          </h2>
          <Can recurso="compras">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={() => {
                  setShowAssetSearch(false);
                  setNewAssetError(null);
                  setNewAssetFieldErrors({});
                  setShowNewAssetForm(true);
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100"
              >
                <PackagePlus size={16} />
                Agregar equipo comprado
              </button>
              <button
                onClick={() => setShowAssetSearch(true)}
                title="Para facturas de equipos que ya estaban en el inventario"
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100"
              >
                <Plus size={16} />
                Vincular equipo existente
              </button>
            </div>
          </Can>
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
                    Sede
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
                              {!pa.llegoConCompra && " • ya existía, solo vinculado"}
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
                        {pa.asset.sede?.nombre ?? "-"}
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
                          {/* Uno comprado y ya repartido no se quita: la compra es su comprobante. */}
                          {(!pa.llegoConCompra || pa.asset.estado === "por_repartir") && (
                            <Can recurso="compras" accion="delete">
                              <button
                                onClick={() => pedirDesvincularActivo(pa)}
                                className="p-1.5 text-fg-subtle hover:text-red-600"
                                title={pa.llegoConCompra ? "Quitar de la compra" : "Desvincular"}
                                aria-label={pa.llegoConCompra ? "Quitar de la compra" : "Desvincular"}
                              >
                                <X size={18} />
                              </button>
                            </Can>
                          )}
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
            <p>No hay equipos en esta compra</p>
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
          <Can recurso="compras">
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
          </Can>
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
                    Comprado
                  </th>
                  <th className="table-th px-4">
                    Por repartir
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
                          {/* A donde fue cada parte (SPEC 2.111). */}
                          {pk.repartos.map((r) => (
                            <p key={r.id} className="text-xs text-fg-muted">
                              {r.cantidad} → {r.sede.nombre}
                              {r.guide && (
                                <>
                                  {" "}
                                  (
                                  <Link href={`/despachos/${r.guide.id}`} className="text-primary-700 hover:underline">
                                    {r.guide.numero}
                                  </Link>
                                  {r.guide.estado === "anulada" && ", anulado"})
                                </>
                              )}
                            </p>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-fg-muted">{pk.cantidad}</td>
                    <td className="px-4 py-4 text-sm">
                      <span className={pk.cantidadPorRepartir > 0 ? "font-medium text-purple-700" : "text-fg-subtle"}>
                        {pk.cantidadPorRepartir}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      {/* Solo sin repartir: todavia no sumo stock. */}
                      {pk.cantidadPorRepartir === pk.cantidad && (
                        <Can recurso="compras" accion="delete">
                          <button
                            onClick={() => pedirDesvincularKitItem(pk.id)}
                            className="p-1.5 text-fg-subtle hover:text-red-600"
                            title="Quitar de la compra"
                            aria-label="Quitar de la compra"
                          >
                            <X size={18} />
                          </button>
                        </Can>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-fg-subtle">
            <Shirt className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No hay artículos de Kit/EPP en esta compra</p>
          </div>
        )}
      </div>

      {/* Despachos que creo el reparto hacia otras sedes */}
      {purchase.despachos.length > 0 && (
        <div className="card">
          <div className="p-6 border-b">
            <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
              <Truck className="h-5 w-5 text-fg-subtle" />
              Despachos del reparto ({purchase.despachos.length})
            </h2>
          </div>
          <ul className="divide-y divide-line">
            {purchase.despachos.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 px-6 py-3">
                <Link href={`/despachos/${d.id}`} className="font-medium text-primary-700 hover:text-primary-900">
                  {d.numero}
                </Link>
                <span className="text-sm text-fg-muted">
                  a {d.sedeDestino.nombre} • {formatearFechaLarga(d.fechaDespacho)} • {d._count.items} equipo(s)
                  {d._count.kitItems > 0 && `, ${d._count.kitItems} línea(s) de Kit/EPP`}
                </span>
                <span
                  className={cn(
                    "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
                    ESTADO_GUIA_COLORS[d.estado]
                  )}
                >
                  {ESTADO_GUIA_LABELS[d.estado]}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {purchase.sede && (
        <VentanaReparto
          isOpen={showReparto}
          onClose={() => setShowReparto(false)}
          onRepartido={async (despacho) => {
            setShowReparto(false);
            setAvisoReparto(
              despacho
                ? { texto: `Se creó el despacho ${despacho.numero}: lo repartido viaja En tránsito.`, despacho }
                : { texto: `Lo repartido quedó Disponible en ${purchase.sede?.nombre}.` }
            );
            await fetchPurchase();
          }}
          compraId={purchase.id}
          sedeLlegada={purchase.sede}
          sedes={sedes}
          equipos={purchase.purchaseAssets
            .filter((pa) => pa.llegoConCompra && pa.asset.estado === "por_repartir")
            .map((pa) => ({
              id: pa.assetId,
              marca: pa.asset.marca,
              modelo: pa.asset.modelo,
              numeroSerie: pa.asset.numeroSerie,
              categoria: pa.asset.categoria.nombre,
            }))}
          lineas={purchase.purchaseKitItems
            .filter((pk) => pk.cantidadPorRepartir > 0)
            .map((pk) => ({ id: pk.id, nombre: pk.item.nombre, porRepartir: pk.cantidadPorRepartir }))}
        />
      )}

      <Modal
        isOpen={showNewAssetForm}
        onClose={() => setShowNewAssetForm(false)}
        title="Agregar equipo comprado"
        size="xl"
      >
        <p className="text-sm text-fg-subtle mb-4">
          Queda en Activos como &quot;Por repartir&quot; en {purchase.sede?.nombre ?? "la sede de llegada"},
          vinculado a esta factura.
        </p>
        <ApiErrorSummary error={newAssetError} fieldErrors={newAssetFieldErrors} />
        {showNewAssetForm && (
          <ActivoForm
            modo="crear"
            sedeFija={purchase.sede?.id ?? ""}
            initialValues={{ ...ACTIVO_FORM_VACIO, fechaCompra: purchase.fechaFactura.slice(0, 10) }}
            onSubmit={agregarEquipoComprado}
            onCancel={() => setShowNewAssetForm(false)}
            erroresServidor={newAssetFieldErrors}
          />
        )}
      </Modal>

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
                puedeElegirSede={!seRepartio}
                ayudaSede={
                  seRepartio
                    ? "Ya se repartió parte de lo comprado: la sede de llegada no se puede cambiar."
                    : 'Si la corriges, lo que espera "Por repartir" se mueve con ella.'
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
              {purchase.purchaseAssets.some((pa) => pa.llegoConCompra) && (
                <span className="block mt-2 text-orange-600">
                  Sus {purchase.purchaseAssets.filter((pa) => pa.llegoConCompra).length} equipo(s) por repartir se
                  descartan del inventario; su registro queda en el historial.
                </span>
              )}
              {purchase.purchaseAssets.some((pa) => !pa.llegoConCompra) && (
                <span className="block mt-2 text-orange-600">
                  Los equipos que ya existían solo se desvinculan.
                </span>
              )}
              {purchase.purchaseKitItems.length > 0 && (
                <span className="block mt-2 text-orange-600">
                  Sus {purchase.purchaseKitItems.length} línea(s) de Kit/EPP se quitan; todavía no sumaban stock.
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
