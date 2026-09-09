"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";

type CategoriaKit = "kit_bienvenida" | "epp";

type KitItem = {
  id: string;
  nombre: string;
  categoria: CategoriaKit;
  cantidad: number;
};

const categoriaLabels: Record<CategoriaKit, string> = {
  kit_bienvenida: "Kit de Bienvenida",
  epp: "EPP",
};

const FORM_INICIAL = { nombre: "", categoria: "kit_bienvenida" as CategoriaKit, cantidad: 0 };

// Catalogo y stock de Kit de Bienvenida / EPP. Deliberadamente separado de
// Categorias de Activos: estos articulos no son equipos (no tienen numero
// de serie, condicion, garantia), son insumos que se cuentan por cantidad.
export default function KitEppPage() {
  const [items, setItems] = useState<KitItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchItems();
  }, []);

  const fetchItems = async () => {
    try {
      const res = await fetch("/api/kit-items");
      if (res.ok) {
        setItems(await res.json());
      }
    } catch (err) {
      console.error("Error fetching kit items:", err);
    } finally {
      setLoading(false);
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
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        await fetchItems();
        setIsCreating(false);
        setFormData(FORM_INICIAL);
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
        setFormData(FORM_INICIAL);
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
    setFormData({ nombre: item.nombre, categoria: item.categoria, cantidad: item.cantidad });
    setIsCreating(false);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData(FORM_INICIAL);
    setError("");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kit de Bienvenida y EPP</h1>
          <p className="text-gray-600 mt-1">
            Artículos e insumos (no equipos) con su stock disponible. Al asignarse en una
            solicitud de onboarding, la cantidad se descuenta automáticamente.
          </p>
        </div>
        {!isCreating && !editingId && (
          <button
            onClick={() => {
              setIsCreating(true);
              setFormData(FORM_INICIAL);
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

      {isCreating && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Artículo</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
              <label className="block text-sm font-medium text-gray-700 mb-1">Categoría *</label>
              <select
                value={formData.categoria}
                onChange={(e) => setFormData({ ...formData, categoria: e.target.value as CategoriaKit })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="kit_bienvenida">Kit de Bienvenida</option>
                <option value="epp">EPP</option>
              </select>
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

      {(["kit_bienvenida", "epp"] as const).map((cat) => (
        <div key={cat} className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">{categoriaLabels[cat]}</h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Nombre
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Stock disponible
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.filter((i) => i.categoria === cat).map((item) => (
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
                      <td className="px-6 py-4 text-center">
                        <input
                          type="number"
                          min={0}
                          value={formData.cantidad}
                          onChange={(e) => setFormData({ ...formData, cantidad: parseInt(e.target.value, 10) || 0 })}
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
                      <td className="px-6 py-4 text-center">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            item.cantidad > 0
                              ? "bg-green-100 text-green-800"
                              : "bg-red-100 text-red-800"
                          }`}
                        >
                          {item.cantidad}
                        </span>
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
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                            title="Eliminar"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
              {items.filter((i) => i.categoria === cat).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-6 py-8 text-center text-gray-500">
                    No hay artículos registrados en {categoriaLabels[cat].toLowerCase()}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
