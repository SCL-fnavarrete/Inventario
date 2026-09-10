"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { ActivosTabs } from "@/components/activos";

type CategoriaKit = "kit_bienvenida" | "epp";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
};

type KitItem = {
  id: string;
  nombre: string;
  categoria: CategoriaKit;
  cantidad: number;
  stockMinimo: number;
  sedeId: string | null;
  sede?: { nombre: string } | null;
};

/**
 * Vista de catalogo/stock de un solo articulo de Kit de Bienvenida o EPP,
 * pensada para vivir dentro de Activos (ver ActivosTabs) en vez de
 * Configuracion -- que quedo admin-only (9-sep-2026) y le quito al tecnico
 * la unica pantalla donde podia agregar/editar su propio stock. Es la misma
 * logica que tenia `configuracion/kit-epp/page.tsx` (que ahora redirige
 * aca), separada por categoria en vez de mostrar ambas mezcladas -- Javier
 * pidio dos ventanas separadas, no una combinada.
 *
 * Aislamiento por sede (SPEC 2.9): el backend (`/api/kit-items`, via
 * sedeWhere/sedeIdParaCrear/assertSedeAccess) ya filtra todo por sede;
 * aca solo se decide que campos mostrar -- admin ve/elige la sede de cada
 * articulo (ve varias sedes mezcladas), tecnico no ve el campo porque
 * siempre es la suya.
 */
export function KitEppCategoriaView({
  categoria,
  titulo,
}: {
  categoria: CategoriaKit;
  titulo: string;
}) {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const formInicial = { nombre: "", categoria, cantidad: 0, stockMinimo: 5, sedeId: "" };

  const [items, setItems] = useState<KitItem[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(formInicial);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchItems();
    if (isAdmin) fetchSedes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, categoria]);

  const fetchItems = async () => {
    try {
      const res = await fetch(`/api/kit-items?categoria=${categoria}`);
      if (res.ok) {
        setItems(await res.json());
      }
    } catch (err) {
      console.error("Error fetching kit items:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSedes = async () => {
    try {
      const res = await fetch("/api/sedes?activas=true");
      if (res.ok) {
        setSedes(await res.json());
      }
    } catch (err) {
      console.error("Error fetching sedes:", err);
    }
  };

  const handleCreate = async () => {
    if (!formData.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }
    try {
      const res = await fetch("/api/kit-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // sedeId "" (sin seleccionar / tecnico que no ve el campo) no es un
        // uuid valido -- se omite en vez de mandarlo vacío.
        body: JSON.stringify({ ...formData, sedeId: formData.sedeId || undefined }),
      });
      if (res.ok) {
        await fetchItems();
        setIsCreating(false);
        setFormData(formInicial);
        setError("");
      } else {
        const data = await res.json();
        setError(data.error || "Error al crear artículo");
      }
    } catch (err) {
      setError("Error al crear artículo");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }
    try {
      const res = await fetch(`/api/kit-items/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchItems();
        setEditingId(null);
        setFormData(formInicial);
        setError("");
      } else {
        const data = await res.json();
        setError(data.error || "Error al actualizar artículo");
      }
    } catch (err) {
      setError("Error al actualizar artículo");
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar este artículo?")) return;
    try {
      const res = await fetch(`/api/kit-items/${id}`, { method: "DELETE" });
      if (res.ok) {
        await fetchItems();
      } else {
        const data = await res.json();
        setError(data.error || "Error al eliminar artículo");
      }
    } catch (err) {
      setError("Error al eliminar artículo");
      console.error(err);
    }
  };

  const startEdit = (item: KitItem) => {
    setEditingId(item.id);
    setFormData({
      nombre: item.nombre,
      categoria: item.categoria,
      cantidad: item.cantidad,
      stockMinimo: item.stockMinimo,
      // La sede de un articulo no se reasigna desde este formulario (se
      // hereda al crearlo, igual que Activos/Empleados).
      sedeId: item.sedeId ?? "",
    });
    setIsCreating(false);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData(formInicial);
    setError("");
  };

  return (
    <div className="space-y-6">
      {/* Tabs del modulo: Equipos / Personal / Kit de Bienvenida / EPP */}
      <ActivosTabs />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{titulo}</h1>
          <p className="text-gray-600 mt-1">
            Artículos e insumos (no equipos) con su stock disponible. Al asignarse en una
            solicitud de onboarding, la cantidad se descuenta automáticamente.
          </p>
        </div>
        {!isCreating && !editingId && (
          <button
            onClick={() => {
              setIsCreating(true);
              setFormData(formInicial);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Nuevo Artículo</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {isCreating && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Artículo</h2>
              <div className={`grid grid-cols-1 md:grid-cols-3 ${isAdmin ? "lg:grid-cols-4" : ""} gap-4`}>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Libreta corporativa, Chaleco reflectante talla M"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Cantidad (stock) *</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.cantidad}
                    onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Stock mínimo *</label>
                  <input
                    type="number"
                    min={0}
                    value={formData.stockMinimo}
                    onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    El Dashboard avisa cuando el stock llega a este número o menos.
                  </p>
                </div>
                {isAdmin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Sede</label>
                    <select
                      value={formData.sedeId}
                      onChange={(e) => setFormData({ ...formData, sedeId: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="">Sin sede (solo lo verás tú)</option>
                      {sedes.map((sede) => (
                        <option key={sede.id} value={sede.id}>
                          {sede.nombre}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      Un técnico hereda automáticamente su propia sede; este campo solo lo ves tú.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Save size={18} />
                  Guardar
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  {isAdmin && (
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sede
                    </th>
                  )}
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock disponible
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Stock mínimo
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id}>
                    {editingId === item.id ? (
                      <>
                        <td className="px-6 py-4">
                          <input
                            type="text"
                            value={formData.nombre}
                            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                            className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {item.sede?.nombre ?? "Sin sede"}
                          </td>
                        )}
                        <td className="px-6 py-4 text-center">
                          <input
                            type="number"
                            min={0}
                            value={formData.cantidad}
                            onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value, 10) || 0 })}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-center"
                          />
                        </td>
                        <td className="px-6 py-4 text-center">
                          <input
                            type="number"
                            min={0}
                            value={formData.stockMinimo}
                            onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                            className="w-24 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-center"
                          />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleUpdate(item.id)}
                              className="p-1 text-green-600 hover:bg-green-50 rounded"
                              title="Guardar"
                            >
                              <Save size={18} />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1 text-gray-600 hover:bg-gray-100 rounded"
                              title="Cancelar"
                            >
                              <X size={18} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 whitespace-nowrap font-medium text-gray-900">
                          {item.nombre}
                        </td>
                        {isAdmin && (
                          <td className="px-6 py-4 text-sm text-gray-500">
                            {item.sede?.nombre ?? "Sin sede"}
                          </td>
                        )}
                        <td className="px-6 py-4 text-center">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                              item.cantidad === 0
                                ? "bg-red-100 text-red-800"
                                : item.cantidad <= item.stockMinimo
                                ? "bg-orange-100 text-orange-800"
                                : "bg-green-100 text-green-800"
                            }`}
                          >
                            {item.cantidad}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center text-gray-500">
                          {item.stockMinimo}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => startEdit(item)}
                              className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                              title="Editar"
                            >
                              <Edit size={18} />
                            </button>
                            {/* Eliminar sigue siendo solo admin (ver
                                permissions.ts, kitEpp.delete) -- se oculta
                                para tecnico en vez de dejar que el boton
                                falle con un 403. */}
                            {isAdmin && (
                              <button
                                onClick={() => handleDelete(item.id)}
                                className="p-1 text-red-600 hover:bg-red-50 rounded"
                                title="Eliminar"
                              >
                                <Trash2 size={18} />
                              </button>
                            )}
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td colSpan={isAdmin ? 5 : 4} className="px-6 py-8 text-center text-gray-500">
                      No hay artículos registrados en {titulo.toLowerCase()}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
