"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Save,
  Loader2,
  FileText,
  Package,
  Plus,
  X,
  AlertCircle,
  PackagePlus,
  Shirt,
  Pencil,
  Check,
} from "lucide-react";
import { parseApiError, type FieldErrors, mensajeDeError } from "@/shared/utilidades/apiErrors";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { PageHeader } from "@/shared/ui/PageHeader";
import { useCampoSede } from "@/shared/ui/providers/SedeSeleccionadaProvider";
import { hoyISO } from "@/shared/utilidades/fechas";
import { Modal } from "@/shared/ui/Modal";
import {
  ACTIVO_FORM_VACIO,
  ActivoForm,
  payloadActivo,
  type ActivoFormValues,
} from "@/modules/activos/componentes";
import { normalizarImei, identificadorActivo } from "@/modules/activos";
import {
  AvisoSeccion,
  ResumenErrores,
  claseCampo,
} from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { ETIQUETAS_FACTURA, validarDatosFactura } from "@/modules/compras";
import { terminaAntesDeEmpezar } from "@/shared/validaciones/ordenFechas";
import { BuscadorEquipoExistente, CamposFactura, NuevoArticuloKit, type DatosFactura } from "@/modules/compras/componentes";
import { logger } from "@/shared/logger";

type Sede = {
  id: string;
  nombre: string;
  codigo: string;
  activa: boolean;
};

type Category = {
  id: string;
  nombre: string;
};

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: { nombre: string };
  modelo: string;
  categoria: {
    nombre: string;
  };
};

type SelectedAsset = {
  assetId: string;
  asset: Asset;
};

// Equipo comprado (SPEC 2.111): se anota aqui y se crea recien al guardar la
// compra, "Por repartir" en la sede de llegada. Asi, si se cancela la compra,
// no queda un equipo suelto en el inventario.
type EquipoNuevo = {
  clave: number;
  valores: ActivoFormValues;
  categoria: string;
};

// Una linea de Kit/EPP es un articulo del catalogo de la sede de llegada y
// una cantidad, que queda "por repartir": el stock sube al repartirla.
type KitItem = {
  id: string;
  nombre: string;
  categoria: "kit_bienvenida" | "epp";
  cantidad: number;
  sedeId: string | null;
};

type SelectedKitItem = {
  itemId: string;
  item: KitItem;
  cantidad: number;
};

export default function NuevaCompraPage() {
  const router = useRouter();
  // La factura y lo que llego con ella; quien puede registrar llega aqui (layout.tsx).
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showAssetSearch, setShowAssetSearch] = useState(false);

  // Equipo comprado: el mismo formulario de Activos > Nuevo (SPEC 2.103), en
  // una ventana. Se anota en la lista y se crea al guardar la compra.
  const [showNewAssetForm, setShowNewAssetForm] = useState(false);
  const [equiposNuevos, setEquiposNuevos] = useState<EquipoNuevo[]>([]);
  // Equipo de la lista que se esta corrigiendo (null = agregando uno nuevo).
  const [editandoClave, setEditandoClave] = useState<number | null>(null);
  // Linea de Kit/EPP cuya cantidad se esta corrigiendo.
  const [editandoKitId, setEditandoKitId] = useState<string | null>(null);
  const [newAssetFieldErrors, setNewAssetFieldErrors] = useState<FieldErrors>({});
  const [newAssetError, setNewAssetError] = useState<string | null>(null);

  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, reportarServidor, limpiar } =
    useErroresFormulario(ETIQUETAS_FACTURA);

  // Sede de llegada (SPEC 2.111): donde llega lo comprado. Prellenada con la
  // del menu, como en los demas formularios (useCampoSede, SPEC 2.80).
  const [sedeId, setSedeId] = useCampoSede();

  // Form data
  const [formData, setFormData] = useState({
    numeroFactura: "",
    fechaFactura: hoyISO(),
    rutProveedor: "",
    ordenCompra: "",
  });

  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);

  const [kitItemsCatalogo, setKitItemsCatalogo] = useState<KitItem[]>([]);
  const [selectedKitItems, setSelectedKitItems] = useState<SelectedKitItem[]>([]);
  const [showKitItemPicker, setShowKitItemPicker] = useState(false);
  const [kitItemToAdd, setKitItemToAdd] = useState("");
  const [kitItemCantidad, setKitItemCantidad] = useState("1");

  useEffect(() => {
    fetchSedes();
    fetchCategories();
  }, []);

  // The Kit/EPP catalog depends on the sede selected above.
  useEffect(() => {
    if (sedeId) {
      fetchKitItemsCatalogo();
    } else {
      setKitItemsCatalogo([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sedeId]);

  async function fetchKitItemsCatalogo() {
    try {
      const params = new URLSearchParams();
      if (sedeId) params.set("sedeId", sedeId);
      const res = await fetch(`/api/kit-items?${params}`);
      const data = await res.json();
      setKitItemsCatalogo(Array.isArray(data) ? data : []);
    } catch (error) {
      logger.error("Error fetching kit items", error);
    }
  }

  function addKitItem() {
    if (reportar(kitItemToAdd ? {} : { kitItem: "Elige un artículo" })) return;
    limpiar("lineas");
    // Con lineas agregadas la sede queda fijada: un cambio del navbar no
    // debe dejarlas asociadas a otra sede.
    setSedeId(sedeId);
    const item = kitItemsCatalogo.find((i) => i.id === kitItemToAdd);
    if (!item) return;
    const cantidad = Math.max(1, parseInt(kitItemCantidad, 10) || 1);
    setSelectedKitItems((prev) => {
      const existing = prev.find((k) => k.itemId === item.id);
      if (existing) {
        return prev.map((k) =>
          k.itemId === item.id ? { ...k, cantidad: k.cantidad + cantidad } : k
        );
      }
      return [...prev, { itemId: item.id, item, cantidad }];
    });
    setKitItemToAdd("");
    setKitItemCantidad("1");
    setShowKitItemPicker(false);
  }

  function removeKitItem(itemId: string) {
    setSelectedKitItems((prev) => prev.filter((k) => k.itemId !== itemId));
  }

  function updateKitItemCantidad(itemId: string, cantidad: number) {
    setSelectedKitItems((prev) =>
      prev.map((k) => (k.itemId === itemId ? { ...k, cantidad: Math.max(1, cantidad) } : k))
    );
  }

  async function fetchSedes() {
    try {
      const res = await fetch("/api/sedes?activas=true");
      const data = await res.json();
      setSedes(Array.isArray(data) ? data : []);
    } catch (error) {
      logger.error("Error fetching sedes", error);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categorias");
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      logger.error("Error fetching categories", error);
    }
  }

  function addAsset(asset: Asset) {
    setSedeId(sedeId);
    limpiar("lineas");
    setSelectedAssets((prev) => [
      ...prev,
      {
        assetId: asset.id,
        asset,
      },
    ]);
    setShowAssetSearch(false);
  }

  function removeAsset(assetId: string) {
    setSelectedAssets((prev) => prev.filter((a) => a.assetId !== assetId));
  }

  // Anota el equipo; se crea al guardar la compra. El N° de serie y el IMEI
  // (SPEC 2.112.7) se revisan ya, en la lista y en el inventario, para avisar
  // en la misma ventana; el servidor los vuelve a revisar al guardar.
  async function anotarEquipo(values: ActivoFormValues) {
    setNewAssetError(null);
    setNewAssetFieldErrors({});
    const identificadores = [
      { campo: "numeroSerie" as const, valor: values.numeroSerie.trim().toUpperCase(), nombre: "N° de serie" },
      { campo: "imei" as const, valor: normalizarImei(values.imei), nombre: "IMEI" },
    ];
    for (const { campo, valor, nombre } of identificadores) {
      if (!valor) continue;
      const repetido = (mensaje: string) => setNewAssetFieldErrors({ [campo]: mensaje });
      const mismo = (otro: string | null | undefined) =>
        (campo === "imei" ? normalizarImei(otro) : (otro ?? "").trim().toUpperCase()) === valor;
      if (equiposNuevos.some((e) => e.clave !== editandoClave && mismo(e.valores[campo]))) {
        return repetido(`Ya agregaste un equipo con este ${nombre}`);
      }
      try {
        const res = await fetch(`/api/activos?${new URLSearchParams({ search: valor, limit: "10" })}`);
        const data = res.ok ? await res.json() : { data: [] };
        if ((data.data as Record<string, string | null>[]).some((a) => mismo(a[campo]))) {
          return repetido(`Ya existe un activo con este ${nombre}`);
        }
      } catch {
        // Sin conexion: lo revisa el servidor al guardar.
      }
    }
    const categoria = categories.find((c) => c.id === values.categoriaId)?.nombre ?? "";
    setEquiposNuevos((prev) =>
      editandoClave === null
        ? [...prev, { clave: Date.now(), valores: values, categoria }]
        : prev.map((e) => (e.clave === editandoClave ? { ...e, valores: values, categoria } : e))
    );
    limpiar("lineas");
    cerrarVentanaEquipo();
  }

  function cerrarVentanaEquipo() {
    setShowNewAssetForm(false);
    setEditandoClave(null);
  }

  function editarEquipoNuevo(clave: number) {
    setShowAssetSearch(false);
    setNewAssetError(null);
    setNewAssetFieldErrors({});
    setEditandoClave(clave);
    setShowNewAssetForm(true);
  }

  function quitarEquipoNuevo(clave: number) {
    setEquiposNuevos((prev) => prev.filter((e) => e.clave !== clave));
  }

  function cambiarFactura(campo: keyof DatosFactura, valor: string) {
    limpiar(campo);
    if (campo === "sedeId") {
      setSedeId(valor);
      // Los equipos existentes y el Kit/EPP son de la sede anterior. Los
      // equipos nuevos no: se crean en la sede de llegada al guardar.
      setSelectedAssets([]);
      setSelectedKitItems([]);
      setShowAssetSearch(false);
      setShowNewAssetForm(false);
      return;
    }
    setFormData((prev) => ({ ...prev, [campo]: valor }));
  }

  // Una compra necesita al menos una linea: equipo o Kit/EPP.
  const sinLineas =
    equiposNuevos.length === 0 && selectedAssets.length === 0 && selectedKitItems.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const faltan = validarDatosFactura({ sedeId, ...formData });
    if (sinLineas) faltan.lineas = "Agrega al menos un equipo o un artículo de Kit/EPP";
    // La garantia de un equipo no puede terminar antes de la factura.
    const garantiaMal = equiposNuevos.findIndex((e) =>
      terminaAntesDeEmpezar(formData.fechaFactura, e.valores.fechaGarantiaFin)
    );
    if (garantiaMal >= 0) {
      const { marca, modelo } = equiposNuevos[garantiaMal].valores;
      setError(`Equipo ${garantiaMal + 1} (${marca} ${modelo}): el fin de la garantía no puede ser anterior a la fecha de la factura.`);
    }
    if (reportar(faltan) || garantiaMal >= 0) return;
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const payload = {
        // Required field; the backend rejects an empty value.
        sedeId: sedeId || undefined,
        numeroFactura: formData.numeroFactura,
        fechaFactura: formData.fechaFactura,
        rutProveedor: formData.rutProveedor || null,
        ordenCompra: formData.ordenCompra || null,
        // La fecha de compra de cada equipo es la de la factura (asi lo guarda el servidor).
        equiposNuevos: equiposNuevos.map((e) => ({
          ...payloadActivo(e.valores, "crear"),
          fechaCompra: formData.fechaFactura || null,
        })),
        assets: selectedAssets.map((a) => ({
          assetId: a.assetId,
        })),
        kitItems: selectedKitItems.map((k) => ({
          itemId: k.itemId,
          cantidad: k.cantidad,
        })),
      };

      const res = await fetch("/api/compras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear la compra");
        // Un error de un equipo ("equiposNuevos.0.campo") se dice con su numero, no con el nombre interno.
        const deEquipos = Object.entries(fe).filter(([k]) => k.startsWith("equiposNuevos."));
        if (deEquipos.length > 0) {
          setError(
            deEquipos.map(([k, v]) => `Equipo ${Number(k.split(".")[1]) + 1}: ${v}`).join(" ")
          );
        } else if (!reportarServidor(fe)) setError(message);
        return;
      }

      const purchase = await res.json();
      router.push(`/compras/${purchase.id}`);
    } catch (err) {
      setError(mensajeDeError(err, "Error desconocido"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        backHref="/compras"
        title="Nueva Compra"
        description="Registra la factura y lo que llegó con ella: queda por repartir en la sede de llegada"
      />

      <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
      <ResumenErrores mensaje={resumen} />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {/* Datos de la factura */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-fg-subtle" />
            Datos de la Factura
          </h2>

          <CamposFactura
            valores={{ sedeId, ...formData }}
            errores={errores}
            onChange={cambiarFactura}
            sedes={sedes}
            puedeElegirSede
            ayudaSede={'Donde llega físicamente lo comprado. Ahí espera "Por repartir" hasta que se reparta a las sedes. Define qué catálogo de Kit/EPP se ofrece más abajo.'}
          />
        </div>

        {/* Vincular Activos */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
              <Package className="h-5 w-5 text-fg-subtle" />
              Equipos
            </h2>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAssetSearch(false);
                  setNewAssetError(null);
                  setNewAssetFieldErrors({});
                  setEditandoClave(null);
                  setShowNewAssetForm(true);
                }}
                disabled={!sedeId}
                title={!sedeId ? "Primero elige la sede de llegada" : undefined}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PackagePlus size={16} />
                Agregar equipo comprado
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewAssetForm(false);
                  setShowAssetSearch(true);
                }}
                disabled={!sedeId}
                title={
                  !sedeId
                    ? "Primero elige la sede de llegada"
                    : "Para facturas de equipos que ya estaban en el inventario"
                }
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                Vincular equipo existente
              </button>
            </div>
          </div>

          {!sedeId && (
            <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>Elige la sede de llegada arriba para agregar equipos.</p>
            </div>
          )}

          {/* Búsqueda de activos */}
          {showAssetSearch && (
            <BuscadorEquipoExistente
              sedeId={sedeId}
              excluirIds={selectedAssets.map((a) => a.assetId)}
              onElegir={addAsset}
              onCerrar={() => setShowAssetSearch(false)}
            />
          )}

          {/* Equipos comprados y equipos existentes vinculados */}
          {equiposNuevos.length + selectedAssets.length > 0 ? (
            <div className="space-y-2">
              {equiposNuevos.map((e) => (
                <div key={e.clave} className="flex items-center gap-4 p-3 bg-surface-muted rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">
                      {e.valores.marca} {e.valores.modelo}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {e.categoria} • {identificadorActivo(e.valores, "Sin serie")}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium bg-purple-50 text-purple-800 border-purple-200">
                    Por repartir
                  </span>
                  <button
                    type="button"
                    onClick={() => editarEquipoNuevo(e.clave)}
                    aria-label={`Editar ${e.valores.marca} ${e.valores.modelo}`}
                    className="p-1.5 text-primary-700 hover:bg-primary-50 rounded"
                  >
                    <Pencil size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => quitarEquipoNuevo(e.clave)}
                    aria-label={`Quitar ${e.valores.marca} ${e.valores.modelo}`}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
              {selectedAssets.map((item) => (
                <div
                  key={item.assetId}
                  className="flex items-center gap-4 p-3 bg-surface-muted rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {item.asset.marca.nombre} {item.asset.modelo}
                    </p>
                    <p className="text-xs text-fg-subtle">
                      {item.asset.categoria.nombre} • {identificadorActivo(item.asset, "Sin serie")}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-fg-subtle">Ya existía: solo se vincula</span>
                  <button
                    type="button"
                    aria-label={`Quitar ${item.asset.marca.nombre} ${item.asset.modelo}`}
                    onClick={() => removeAsset(item.assetId)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}

              <div className="flex justify-between items-center pt-4 border-t mt-4">
                <span className="text-sm text-fg-subtle">
                  {equiposNuevos.length + selectedAssets.length} equipo(s)
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-fg-subtle">
              <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay equipos en esta compra</p>
              <p className="text-xs text-fg-subtle mt-1">
                Los equipos comprados quedan &quot;Por repartir&quot; en la sede de llegada
              </p>
            </div>
          )}
        </div>

        {/* Kit/EPP: articulo del catalogo de la sede de llegada y cantidad.
            Queda por repartir; el stock sube al repartirlo. */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
              <Shirt className="h-5 w-5 text-fg-subtle" />
              Kit de Bienvenida / EPP Comprado
            </h2>
            <button
              type="button"
              onClick={() => setShowKitItemPicker((v) => !v)}
              disabled={!sedeId}
              title={!sedeId ? "Primero elige la sede de llegada" : undefined}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Agregar Artículo
            </button>
          </div>

          {!sedeId && (
            <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>Elige la sede de llegada arriba para ver el catálogo de Kit/EPP de esa sede.</p>
            </div>
          )}

          {showKitItemPicker && (
            <div className="mb-4 p-4 bg-surface-muted rounded-lg flex flex-col sm:flex-row gap-3 sm:items-end">
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
                {kitItemsCatalogo.length === 0 && (
                  <p className="text-xs text-fg-subtle mt-1">
                    No hay artículos en el catálogo de esta sede. Crea el primero aquí abajo.
                  </p>
                )}
                <NuevoArticuloKit
                  sedeId={sedeId}
                  onCreado={(item) => {
                    setKitItemsCatalogo((prev) => [...prev, item]);
                    setKitItemToAdd(item.id);
                    limpiar("kitItem");
                  }}
                />
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
                onClick={addKitItem}
                className={buttonClasses({ size: "sm" })}
              >
                <Plus size={16} />
                Agregar
              </button>
            </div>
          )}

          {selectedKitItems.length > 0 ? (
            <div className="space-y-2">
              {selectedKitItems.map((k) => (
                <div
                  key={k.itemId}
                  className="flex items-center gap-4 p-3 bg-surface-muted rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{k.item.nombre}</p>
                    <p className="text-xs text-fg-subtle">
                      {k.item.categoria === "epp" ? "EPP" : "Kit Bienvenida"} • queda por repartir
                    </p>
                  </div>
                  {editandoKitId === k.itemId ? (
                    <>
                      <input
                        type="number"
                        min={1}
                        autoFocus
                        aria-label={`Cantidad de ${k.item.nombre}`}
                        value={k.cantidad}
                        onChange={(e) => updateKitItemCantidad(k.itemId, parseInt(e.target.value, 10) || 1)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            setEditandoKitId(null);
                          }
                        }}
                        className="w-20 px-2 py-1 text-sm border border-line-strong rounded-lg text-center"
                      />
                      <button
                        type="button"
                        aria-label="Listo"
                        onClick={() => setEditandoKitId(null)}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                      >
                        <Check size={18} />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="w-20 text-center text-sm font-medium">{k.cantidad}</span>
                      <button
                        type="button"
                        aria-label={`Editar la cantidad de ${k.item.nombre}`}
                        onClick={() => setEditandoKitId(k.itemId)}
                        className="p-1.5 text-primary-700 hover:bg-primary-50 rounded"
                      >
                        <Pencil size={18} />
                      </button>
                    </>
                  )}
                  <button aria-label="Quitar artículo"
                    type="button"
                    onClick={() => removeKitItem(k.itemId)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded"
                  >
                    <X size={18} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-fg-subtle">
              <Shirt className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay artículos de Kit/EPP en esta compra</p>
              <p className="text-xs text-fg-subtle mt-1">
                Si la factura trajo cascos, chalecos, etc., agrégalos acá: quedan por repartir y el stock sube al repartirlos
              </p>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex items-center justify-end gap-4">
          {/* El servidor tambien rechaza una compra sin lineas. */}
          <AvisoSeccion mensaje={errores.lineas} />
          <Link
            href="/compras"
            className={buttonClasses({ variant: "outline", className: "px-6" })}
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving}
            className={buttonClasses({ className: "px-6" })}
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

      <Modal
        isOpen={showNewAssetForm}
        onClose={cerrarVentanaEquipo}
        title={editandoClave === null ? "Agregar equipo comprado" : "Editar equipo comprado"}
        size="2xl"
      >
        <p className="text-sm text-fg-subtle mb-4">
          El equipo se crea al guardar la compra: queda en Activos como &quot;Por repartir&quot; en la
          sede de llegada, vinculado a esta factura.
        </p>
        <ApiErrorSummary error={newAssetError} fieldErrors={newAssetFieldErrors} />
        {showNewAssetForm && (
          <ActivoForm
            key={editandoClave ?? "nuevo"}
            modo="crear"
            sedeFija={sedeId}
            initialValues={
              equiposNuevos.find((e) => e.clave === editandoClave)?.valores ?? {
                ...ACTIVO_FORM_VACIO,
                fechaCompra: formData.fechaFactura,
              }
            }
            onSubmit={anotarEquipo}
            onCancel={cerrarVentanaEquipo}
            erroresServidor={newAssetFieldErrors}
          />
        )}
      </Modal>
    </div>
  );
}
