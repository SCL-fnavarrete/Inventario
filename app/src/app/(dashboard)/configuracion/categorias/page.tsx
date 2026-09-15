"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";

/**
 * Confirmacion pendiente (15-sep-2026, SPEC 2.40). Esta pantalla usaba
 * `confirm()` del navegador, que se ve distinto al resto del sistema y
 * bloquea la ventana entera. Mismo formato que el modal de compras
 * (SPEC 2.38) para que todas las confirmaciones se vean iguales.
 */
type Confirmacion = {
  titulo: string;
  mensaje: string;
  textoBoton: string;
  onConfirm: () => void | Promise<void>;
};

type Category = {
  id: string;
  nombre: string;
  descripcion: string | null;
  requiereSerie: boolean;
  requiereImei: boolean;
  stockMinimo: number;
  _count?: { assets: number };
};

const FORM_INICIAL = {
  nombre: "",
  descripcion: "",
  requiereSerie: true,
  requiereImei: false,
  stockMinimo: 3,
};

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const res = await fetch("/api/categorias?includeCount=true");
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
    } catch (err) {
      console.error("Error fetching categories:", err);
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
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchCategories();
        setIsCreating(false);
        setFormData(FORM_INICIAL);
        setError("");
        setFieldErrors({});
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear categoría");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al crear categoría");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }

    try {
      const res = await fetch(`/api/categorias/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchCategories();
        setEditingId(null);
        setFormData(FORM_INICIAL);
        setError("");
        setFieldErrors({});
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar categoría");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al actualizar categoría");
      console.error(err);
    }
  };

  const pedirEliminar = (category: Category) => {
    setConfirmacion({
      titulo: "Eliminar categoría",
      mensaje: `La categoría "${category.nombre}" se borra del catálogo y deja de aparecer al crear o editar activos. No se puede deshacer; los activos ya registrados no se tocan (por eso el botón queda deshabilitado si la categoría tiene activos).`,
      textoBoton: "Eliminar",
      onConfirm: () => handleDelete(category.id),
    });
  };

  const handleDelete = async (id: string) => {
    setConfirmacion(null);

    try {
      const res = await fetch(`/api/categorias/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchCategories();
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar categoría");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al eliminar categoría");
      console.error(err);
    }
  };

  const startEdit = (category: Category) => {
    setEditingId(category.id);
    setFormData({
      nombre: category.nombre,
      descripcion: category.descripcion || "",
      requiereSerie: category.requiereSerie,
      requiereImei: category.requiereImei,
      stockMinimo: category.stockMinimo,
    });
    setIsCreating(false);
    setError("");
    setFieldErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData(FORM_INICIAL);
    setError("");
    setFieldErrors({});
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
          <h1 className="text-2xl font-bold text-gray-900">Categorías de Activos</h1>
          <p className="text-gray-600 mt-1">Gestiona las categorías para clasificar los activos</p>
        </div>
        {!isCreating && !editingId && (
          <button
            onClick={() => {
              setIsCreating(true);
              setFormData(FORM_INICIAL);
              setError("");
              setFieldErrors({});
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Nueva Categoría</span>
          </button>
        )}
      </div>

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Formulario de creación */}
      {isCreating && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nueva Categoría</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre *
              </label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Notebook, Celular, Monitor"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción
              </label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Descripción de la categoría"
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.requiereSerie}
                  onChange={(e) => setFormData({ ...formData, requiereSerie: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Requiere N° Serie</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.requiereImei}
                  onChange={(e) => setFormData({ ...formData, requiereImei: e.target.checked })}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Requiere IMEI</span>
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Stock mínimo (disponibles)
              </label>
              <input
                type="number"
                min={0}
                value={formData.stockMinimo}
                onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                El Dashboard avisa cuando los activos disponibles de esta categoría llegan a
                este número o menos.
              </p>
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

      {/* Tabla de categorías */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Descripción
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Req. Serie
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Req. IMEI
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stock mínimo
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Activos
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {categories.map((category) => (
              <tr key={category.id}>
                {editingId === category.id ? (
                  <>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.descripcion}
                        onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={formData.requiereSerie}
                        onChange={(e) => setFormData({ ...formData, requiereSerie: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={formData.requiereImei}
                        onChange={(e) => setFormData({ ...formData, requiereImei: e.target.checked })}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        min={0}
                        value={formData.stockMinimo}
                        onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                        className="w-20 px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 text-center text-gray-500">
                      {category._count?.assets || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleUpdate(category.id)}
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
                      {category.nombre}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {category.descripcion || "-"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        category.requiereSerie
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {category.requiereSerie ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        category.requiereImei
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {category.requiereImei ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-500">
                      {category.stockMinimo}
                    </td>
                    <td className="px-6 py-4 text-center text-gray-500">
                      {category._count?.assets || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(category)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          title="Editar"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => pedirEliminar(category)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title="Eliminar"
                          disabled={(category._count?.assets || 0) > 0}
                        >
                          <Trash2 size={18} className={(category._count?.assets || 0) > 0 ? "opacity-30" : ""} />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                  No hay categorías registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmacion de eliminacion, con el mismo formato que el resto del
          sistema en vez del confirm() del navegador (15-sep-2026, SPEC 2.40). */}
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
    </div>
  );
}
