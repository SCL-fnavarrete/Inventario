"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Save,
  Loader2,
  FileText,
  Package,
  Plus,
  X,
  Search,
  AlertCircle,
  PackagePlus,
  Shirt,
} from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";

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
  marca: string;
  modelo: string;
  categoria: {
    nombre: string;
  };
};

type SelectedAsset = {
  assetId: string;
  asset: Asset;
};

// Kit/EPP (14-sep-2026, SPEC 2.36, pedido explicito de Javier): a diferencia
// de un Activo, acá no se elige una unidad existente -- se elige un artículo
// del catálogo (WelcomeKitItem) y una cantidad, que suma al stock de esa
// sede al guardar la compra.
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
  const { data: session } = useSession();
  // Tecnico (11-sep-2026): registra la compra con lo esencial -- factura y
  // con que activos vino. La sede si se le pregunta desde el 18-sep-2026
  // (SPEC 2.10.2): viene precargada con la suya, igual que en Activos >
  // Nuevo.
  //
  // Compras se simplifico el 11-sep-2026 (pedido explicito de Javier) a
  // solo dos datos -- la factura, para relacionarla, y los equipos que
  // vinieron con ella. Se eliminaron el catalogo de proveedor y todo dato
  // financiero (monto, moneda, precio unitario): "el tema del dinero no es
  // un dato que nos interese" para el area de soporte. El mismo dia se
  // agrego el RUT del proveedor (texto libre) y se quito el campo de
  // documento, que no se usaba. Ver SPEC 2.10.
  // Solo admin elige sede (18-sep-2026, SPEC 2.29.1).
  const esAdminSede = session?.user?.role === "admin";
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  const [assetSearch, setAssetSearch] = useState("");
  const [showAssetSearch, setShowAssetSearch] = useState(false);

  // Alta de equipo nuevo directamente desde este formulario (11-sep-2026,
  // pedido explicito de Javier): el equipo que llego con la factura muchas
  // veces todavia no existe como Activo -- antes habia que crearlo primero
  // en Activos > Nuevo y volver aca a vincularlo. Este modo llama al mismo
  // POST /api/activos que usa esa pantalla, asi que reusa sus reglas
  // (sede, numero de serie duplicado, historial) sin duplicarlas aca.
  const [showNewAssetForm, setShowNewAssetForm] = useState(false);
  const [creatingAsset, setCreatingAsset] = useState(false);
  const [newAssetError, setNewAssetError] = useState<string | null>(null);
  const [newAssetFieldErrors, setNewAssetFieldErrors] = useState<FieldErrors>({});
  // Specs por categoria (14-sep-2026, pedido explicito de Javier): antes
  // este alta rapida solo pedia categoria/marca/modelo/serie, a diferencia
  // de /activos/nuevo, que si tiene secciones propias por categoria (ver
  // SPEC 2.11). Mismos campos y mismo criterio de categoria que esa
  // pantalla -- ver SPEC 2.21.
  const [newAssetForm, setNewAssetForm] = useState({
    categoriaId: "",
    marca: "",
    modelo: "",
    numeroSerie: "",
    procesador: "",
    ram: "",
    almacenamiento: "",
    sistemaOperativo: "",
    antivirus: "",
    tipoLicenciaMicrosoft365: "",
    imei: "",
    numeroTelefono: "",
    pulgadas: "",
    conectividad: "",
  });

  function handleNewAssetChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) {
    const { name, value } = e.target;
    setNewAssetForm((prev) => ({ ...prev, [name]: value }));
  }

  const selectedNewAssetCategory = categories.find(
    (c) => c.id === newAssetForm.categoriaId
  );
  const isNewAssetNotebook = selectedNewAssetCategory?.nombre.toLowerCase() === "notebook";
  const isNewAssetCelular = selectedNewAssetCategory?.nombre.toLowerCase() === "celular";
  const isNewAssetMonitor = selectedNewAssetCategory?.nombre.toLowerCase() === "monitor";
  const PERIFERICOS_SIMPLES = ["mouse", "teclado", "webcam", "audífonos"];
  const isNewAssetPerifericoSimple = selectedNewAssetCategory
    ? PERIFERICOS_SIMPLES.includes(selectedNewAssetCategory.nombre.toLowerCase())
    : false;

  // Form data
  const [formData, setFormData] = useState({
    // A que sede se le atribuye la compra. 18-sep-2026 (SPEC 2.10.2): el
    // campo ahora lo ve cualquier rol -- antes era admin-only y al tecnico
    // ni se le preguntaba, lo que desde SPEC 2.29 lo dejo sin poder crear
    // compras (el backend exigia la sede que el formulario nunca pedia).
    // Para el tecnico viene precargado con la suya (ver useEffect abajo),
    // mismo patron que Activos > Nuevo.
    sedeId: "",
    numeroFactura: "",
    fechaFactura: new Date().toISOString().split("T")[0],
    rutProveedor: "",
    ordenCompra: "",
  });

  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);

  // Kit/EPP (SPEC 2.36)
  const [kitItemsCatalogo, setKitItemsCatalogo] = useState<KitItem[]>([]);
  const [selectedKitItems, setSelectedKitItems] = useState<SelectedKitItem[]>([]);
  const [showKitItemPicker, setShowKitItemPicker] = useState(false);
  const [kitItemToAdd, setKitItemToAdd] = useState("");
  const [kitItemCantidad, setKitItemCantidad] = useState("1");

  useEffect(() => {
    fetchSedes();
    fetchCategories();
  }, []);

  // Precarga la sede del usuario (18-sep-2026, SPEC 2.10.2). El
  // "|| prev.sedeId" evita pisar una eleccion manual si ya eligio otra --
  // mismo patron que Activos > Nuevo.
  useEffect(() => {
    if (session?.user?.sedeId) {
      setFormData((prev) => ({ ...prev, sedeId: prev.sedeId || session.user.sedeId! }));
    }
  }, [session?.user?.sedeId]);

  // El catálogo de Kit/EPP depende de la sede elegida arriba, para
  // cualquier rol (18-sep-2026, SPEC 2.10.2) -- mismo criterio que "Crear
  // Equipo Nuevo".
  useEffect(() => {
    if (formData.sedeId) {
      fetchKitItemsCatalogo();
    } else {
      setKitItemsCatalogo([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.sedeId]);

  async function fetchKitItemsCatalogo() {
    try {
      const params = new URLSearchParams();
      if (formData.sedeId) params.set("sedeId", formData.sedeId);
      const res = await fetch(`/api/kit-items?${params}`);
      const data = await res.json();
      setKitItemsCatalogo(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching kit items:", error);
    }
  }

  function addKitItem() {
    if (!kitItemToAdd) return;
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
      console.error("Error fetching sedes:", error);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/categorias");
      const data = await res.json();
      setCategories(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }

  useEffect(() => {
    if (assetSearch.length >= 2) {
      searchAssets();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetSearch, formData.sedeId]);

  async function searchAssets() {
    setLoadingAssets(true);
    try {
      // Acotado a la sede de la compra (18-sep-2026, SPEC 2.10.3): antes
      // buscaba en todo el inventario, asi que un admin podia vincular a una
      // compra de Santiago un equipo de Concepcion. La sede la manda el
      // formulario, NO el selector del nav: ese es un filtro de vista, y la
      // sede de la compra es un dato del registro. Mismo criterio que el
      // catalogo de Kit/EPP de mas abajo y que SelectorActivos en Guias de
      // Despacho.
      const params = new URLSearchParams({
        search: assetSearch,
        limit: "20",
      });
      if (formData.sedeId) params.set("sedeId", formData.sedeId);
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
      },
    ]);
    setAssetSearch("");
    setShowAssetSearch(false);
    setAvailableAssets([]);
  }

  function removeAsset(assetId: string) {
    setSelectedAssets((prev) => prev.filter((a) => a.assetId !== assetId));
  }

  async function createNewAsset() {
    if (!newAssetForm.categoriaId || !newAssetForm.marca || !newAssetForm.modelo) {
      setNewAssetError("Categoría, marca y modelo son obligatorios.");
      return;
    }

    setCreatingAsset(true);
    setNewAssetError(null);
    setNewAssetFieldErrors({});

    try {
      const res = await fetch("/api/activos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoriaId: newAssetForm.categoriaId,
          marca: newAssetForm.marca,
          modelo: newAssetForm.modelo,
          numeroSerie: newAssetForm.numeroSerie || null,
          // Specs por categoria (14-sep-2026, SPEC 2.21) -- el backend
          // ignora los campos que no correspondan a Asset, asi que no hace
          // falta condicionar por categoria aca, igual que en /activos/nuevo.
          procesador: newAssetForm.procesador || null,
          ram: newAssetForm.ram || null,
          discoDuro: newAssetForm.almacenamiento || null,
          sistemaOperativo: newAssetForm.sistemaOperativo || null,
          antivirus: newAssetForm.antivirus || null,
          // Igual que en /activos/nuevo (SPEC 2.23): no hay checkbox propio
          // de "tiene M365", se deriva de si se cargo el nombre del plan.
          tipoLicenciaMicrosoft365: newAssetForm.tipoLicenciaMicrosoft365 || null,
          microsoft365: Boolean(newAssetForm.tipoLicenciaMicrosoft365),
          imei: newAssetForm.imei || null,
          numeroTelefono: newAssetForm.numeroTelefono || null,
          pulgadas: newAssetForm.pulgadas || null,
          conectividad: newAssetForm.conectividad || null,
          // El equipo llega a la misma sede que la compra, la que se eligio
          // arriba (obligatoria para cualquier rol desde SPEC 2.10.2 --
          // antes al tecnico no se le preguntaba). Ver SPEC 2.8.2/2.10.
          sedeId: formData.sedeId || undefined,
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear el equipo");
        setNewAssetError(message);
        setNewAssetFieldErrors(fe);
        return;
      }

      const asset = await res.json();
      setSelectedAssets((prev) => [
        ...prev,
        {
          assetId: asset.id,
          asset: {
            id: asset.id,
            numeroSerie: asset.numeroSerie,
            marca: asset.marca,
            modelo: asset.modelo,
            categoria: categories.find((c) => c.id === asset.categoriaId) || {
              nombre: "",
            },
          },
        },
      ]);
      setNewAssetForm({
        categoriaId: "",
        marca: "",
        modelo: "",
        numeroSerie: "",
        procesador: "",
        ram: "",
        almacenamiento: "",
        sistemaOperativo: "",
        antivirus: "",
        tipoLicenciaMicrosoft365: "",
        imei: "",
        numeroTelefono: "",
        pulgadas: "",
        conectividad: "",
      });
      setShowNewAssetForm(false);
    } catch (err) {
      setNewAssetError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setCreatingAsset(false);
    }
  }

  // Una compra necesita al menos una linea, de equipos o de Kit/EPP
  // (18-sep-2026, SPEC 2.10.4).
  const sinLineas = selectedAssets.length === 0 && selectedKitItems.length === 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sinLineas) {
      setError("Vincula al menos un equipo o un artículo de Kit/EPP antes de guardar.");
      return;
    }
    setSaving(true);
    setError(null);
    setFieldErrors({});

    try {
      const payload = {
        // Obligatoria para cualquier rol (18-sep-2026, SPEC 2.10.2): el
        // select no ofrece opcion en blanco y el backend rechaza la
        // creacion si llegara vacia. Antes solo se enviaba para admin, y
        // un tecnico chocaba con "Debes seleccionar una sede" sin tener
        // donde elegirla. Ver SPEC 2.8.2/2.10.
        sedeId: formData.sedeId || undefined,
        numeroFactura: formData.numeroFactura,
        fechaFactura: formData.fechaFactura,
        rutProveedor: formData.rutProveedor || null,
        ordenCompra: formData.ordenCompra || null,
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
        setError(message);
        setFieldErrors(fe);
        return;
      }

      const purchase = await res.json();
      router.push(`/compras/${purchase.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSaving(false);
    }
  }

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

      <ApiErrorSummary error={error} fieldErrors={fieldErrors} />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Datos de la factura */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            Datos de la Factura
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sede -- visible para cualquier rol desde SPEC 2.10.2 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sede <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.sedeId}
                onChange={(e) => {
                  setFormData({ ...formData, sedeId: e.target.value });
                  // Lo ya elegido es de la sede anterior -- se limpia para no
                  // arrastrar equipos ni articulos que ya no corresponden
                  // (mismo criterio que Nueva Guia de Despacho al cambiar la
                  // sede origen). SPEC 2.10.3.
                  setSelectedAssets([]);
                  setSelectedKitItems([]);
                  setShowAssetSearch(false);
                  setShowNewAssetForm(false);
                }}
                required
                disabled={!esAdminSede}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50 disabled:text-gray-600 disabled:cursor-not-allowed"
              >
                <option value="" disabled>
                  Selecciona una sede...
                </option>
                {sedes.map((sede) => (
                  <option key={sede.id} value={sede.id}>
                    {sede.nombre}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">
                {esAdminSede
                  ? "Obligatorio: sede a la que se atribuye esta compra. Define qué catálogo de Kit/EPP se ofrece más abajo."
                  : "Es tu sede: la compra queda registrada en ella, y define qué catálogo de Kit/EPP se ofrece más abajo."}
              </p>
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

            {/* RUT Proveedor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                RUT del Proveedor
              </label>
              <input
                type="text"
                value={formData.rutProveedor}
                onChange={(e) => setFormData({ ...formData, rutProveedor: e.target.value })}
                placeholder="Ej: 76.123.456-7"
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowNewAssetForm(false);
                  setShowAssetSearch(true);
                }}
                disabled={!formData.sedeId}
                title={!formData.sedeId ? "Primero elige la sede de la compra" : undefined}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={16} />
                Buscar Existente
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAssetSearch(false);
                  setShowNewAssetForm(true);
                }}
                disabled={!formData.sedeId}
                title={!formData.sedeId ? "Primero elige la sede de la compra" : undefined}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <PackagePlus size={16} />
                Crear Equipo Nuevo
              </button>
            </div>
          </div>

          {!formData.sedeId && (
            <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>Elige la sede de la compra arriba para poder vincular equipos: el inventario que se ofrece es el de esa sede.</p>
            </div>
          )}

          {/* Alta de equipo nuevo -- el equipo todavia no existe como Activo.
              Es un div, no un <form>: ya estamos dentro del <form> de la
              compra y HTML no permite formularios anidados. */}
          {showNewAssetForm && (
            <div className="mb-4 p-4 bg-green-50 rounded-lg space-y-3">
              <ApiErrorSummary error={newAssetError} fieldErrors={newAssetFieldErrors} />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Categoría <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newAssetForm.categoriaId}
                    onChange={(e) =>
                      setNewAssetForm({ ...newAssetForm, categoriaId: e.target.value })
                    }
                    required
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="" disabled>
                      Selecciona una categoría...
                    </option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.nombre}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    N° Serie
                  </label>
                  <input
                    type="text"
                    value={newAssetForm.numeroSerie}
                    onChange={(e) =>
                      setNewAssetForm({ ...newAssetForm, numeroSerie: e.target.value })
                    }
                    placeholder="Opcional"
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Marca <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newAssetForm.marca}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, marca: e.target.value })}
                    required
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Modelo <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newAssetForm.modelo}
                    onChange={(e) => setNewAssetForm({ ...newAssetForm, modelo: e.target.value })}
                    required
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Specs por categoria -- mismos campos y mismo criterio que
                  /activos/nuevo (SPEC 2.11), agregados aca el 14-sep-2026
                  (SPEC 2.21) porque antes esta alta rapida solo pedia los 4
                  campos genericos de arriba. */}
              {isNewAssetNotebook && (
                <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-3">
                  <p className="text-xs font-medium text-gray-600">Especificaciones - Notebook</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Procesador</label>
                      <input
                        type="text"
                        name="procesador"
                        value={newAssetForm.procesador}
                        onChange={handleNewAssetChange}
                        placeholder="ej: Intel Core i7-1165G7"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">RAM</label>
                      <input
                        type="text"
                        name="ram"
                        value={newAssetForm.ram}
                        onChange={handleNewAssetChange}
                        placeholder="ej: 16GB"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Almacenamiento</label>
                      <input
                        type="text"
                        name="almacenamiento"
                        value={newAssetForm.almacenamiento}
                        onChange={handleNewAssetChange}
                        placeholder="ej: 512GB SSD"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Sistema Operativo</label>
                      <input
                        type="text"
                        name="sistemaOperativo"
                        value={newAssetForm.sistemaOperativo}
                        onChange={handleNewAssetChange}
                        placeholder="ej: Windows 11 Pro"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Antivirus</label>
                      <input
                        type="text"
                        name="antivirus"
                        value={newAssetForm.antivirus}
                        onChange={handleNewAssetChange}
                        placeholder="ej: Windows Defender"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Licencia Microsoft 365</label>
                      <input
                        type="text"
                        name="tipoLicenciaMicrosoft365"
                        value={newAssetForm.tipoLicenciaMicrosoft365}
                        onChange={handleNewAssetChange}
                        placeholder="ej: Premium (vacío si no tiene)"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {isNewAssetCelular && (
                <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-3">
                  <p className="text-xs font-medium text-gray-600">Especificaciones - Celular</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">IMEI</label>
                      <input
                        type="text"
                        name="imei"
                        value={newAssetForm.imei}
                        onChange={handleNewAssetChange}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Número de Teléfono</label>
                      <input
                        type="text"
                        name="numeroTelefono"
                        value={newAssetForm.numeroTelefono}
                        onChange={handleNewAssetChange}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Almacenamiento</label>
                      <input
                        type="text"
                        name="almacenamiento"
                        value={newAssetForm.almacenamiento}
                        onChange={handleNewAssetChange}
                        placeholder="ej: 128GB"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {isNewAssetMonitor && (
                <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-3">
                  <p className="text-xs font-medium text-gray-600">Especificaciones - Monitor</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Pulgadas</label>
                      <input
                        type="text"
                        name="pulgadas"
                        value={newAssetForm.pulgadas}
                        onChange={handleNewAssetChange}
                        placeholder="ej: 24"
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {isNewAssetPerifericoSimple && (
                <div className="p-3 bg-white border border-gray-200 rounded-lg space-y-3">
                  <p className="text-xs font-medium text-gray-600">
                    Especificaciones - {selectedNewAssetCategory?.nombre}
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Conectividad</label>
                      <select
                        name="conectividad"
                        value={newAssetForm.conectividad}
                        onChange={handleNewAssetChange}
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Seleccionar conectividad</option>
                        <option value="usb">USB</option>
                        <option value="bluetooth">Bluetooth</option>
                        <option value="cable">Cable</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-gray-500">
                El equipo queda dado de alta en Activos (disponible, sede de esta compra) y vinculado a esta factura.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNewAssetForm(false);
                    setNewAssetError(null);
                  }}
                  className="px-3 py-1.5 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={createNewAsset}
                  disabled={creatingAsset}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {creatingAsset ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PackagePlus size={16} />
                  )}
                  Agregar Equipo
                </button>
              </div>
            </div>
          )}

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

        {/* Kit/EPP comprado (14-sep-2026, SPEC 2.36): a diferencia de
            Activos, acá no se crea una unidad nueva -- se elige un
            artículo del catálogo y una cantidad, que suma al stock de la
            sede cuando se guarda la compra. */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <Shirt className="h-5 w-5 text-gray-400" />
              Kit de Bienvenida / EPP Comprado
            </h2>
            <button
              type="button"
              onClick={() => setShowKitItemPicker((v) => !v)}
              disabled={!formData.sedeId}
              title={!formData.sedeId ? "Primero elige la sede de la compra" : undefined}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={16} />
              Agregar Artículo
            </button>
          </div>

          {!formData.sedeId && (
            <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p>Elige la sede de la compra arriba para ver el catálogo de Kit/EPP de esa sede.</p>
            </div>
          )}

          {showKitItemPicker && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg flex flex-col sm:flex-row gap-3 sm:items-end">
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
                {kitItemsCatalogo.length === 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    No hay artículos en el catálogo de esta sede. Se crean desde Activos &gt; Kit de Bienvenida.
                  </p>
                )}
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
                onClick={addKitItem}
                disabled={!kitItemToAdd}
                className="flex items-center justify-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
                  className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{k.item.nombre}</p>
                    <p className="text-xs text-gray-500">
                      {k.item.categoria === "epp" ? "EPP" : "Kit Bienvenida"} • stock actual: {k.item.cantidad}
                    </p>
                  </div>
                  <input
                    type="number"
                    min={1}
                    value={k.cantidad}
                    onChange={(e) => updateKitItemCantidad(k.itemId, parseInt(e.target.value, 10) || 1)}
                    className="w-20 px-2 py-1 text-sm border border-gray-300 rounded-lg text-center"
                  />
                  <button
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
            <div className="text-center py-8 text-gray-500">
              <Shirt className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p className="text-sm">No hay artículos de Kit/EPP en esta compra</p>
              <p className="text-xs text-gray-400 mt-1">
                Si la factura trajo cascos, chalecos, notebooks de bienvenida, etc., agrégalos acá para sumarlos al stock
              </p>
            </div>
          )}
        </div>

        {/* Botones */}
        <div className="flex items-center justify-end gap-4">
          {/* Una compra sin equipos ni articulos no registra nada
              (18-sep-2026, SPEC 2.10.4). El backend tambien lo rechaza. */}
          {sinLineas && (
            <p className="text-sm text-amber-700">
              Vincula al menos un equipo o un artículo de Kit/EPP para poder guardar.
            </p>
          )}
          <Link
            href="/compras"
            className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={saving || !formData.numeroFactura || !formData.sedeId || sinLineas}
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
