"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";

/**
 * Confirmacion con el componente compartido ConfirmDialog, en vez de
 * confirm() del navegador.
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

const ETIQUETAS = { nombre: "Nombre", stockMinimo: "Stock mínimo" };

export default function CategoriasPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  const cambiarNombre = (nombre: string) => {
    setFormData((prev) => ({ ...prev, nombre }));
    limpiar("nombre");
  };

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
    if (reportar(formData.nombre.trim() ? {} : { nombre: "Escribe el nombre" })) return;

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
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al crear categoría");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (reportar(formData.nombre.trim() ? {} : { nombre: "Escribe el nombre" })) return;

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
        if (!reportarServidor(fe)) setError(message);
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
    reportar({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData(FORM_INICIAL);
    setError("");
    setFieldErrors({});
    reportar({});
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Categorías de Activos"
        description="Gestiona las categorías para clasificar los activos"
        actions={
          <>
            {!isCreating && !editingId && (
              <button
                onClick={() => {
                  setIsCreating(true);
                  setFormData(FORM_INICIAL);
                  setError("");
                  setFieldErrors({});
                }}
                className={buttonClasses()}
              >
                <Plus size={20} />
                <span>Nueva Categoría</span>
              </button>
            )}
          </>
        }
      />

      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Formulario de creación */}
      {isCreating && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4">Nueva Categoría</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">
                Nombre *
              </label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => cambiarNombre(e.target.value)}
                aria-invalid={!!errores.nombre}
                className={claseCampo(errores.nombre)}
                placeholder="Ej: Notebook, Celular, Monitor"
              />
              <MensajeCampo mensaje={errores.nombre} />
            </div>
            <div>
              <label className="field-label">
                Descripción
              </label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="field-input"
                placeholder="Descripción de la categoría"
              />
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.requiereSerie}
                  onChange={(e) => setFormData({ ...formData, requiereSerie: e.target.checked })}
                  className="field-checkbox"
                />
                <span className="text-sm text-fg-muted">Requiere N° Serie</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.requiereImei}
                  onChange={(e) => setFormData({ ...formData, requiereImei: e.target.checked })}
                  className="field-checkbox"
                />
                <span className="text-sm text-fg-muted">Requiere IMEI</span>
              </label>
            </div>
            <div>
              <label className="field-label">
                Stock mínimo (disponibles)
              </label>
              <input
                type="number"
                min={0}
                value={formData.stockMinimo}
                onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                className="field-input"
              />
              <p className="text-xs text-fg-subtle mt-1">
                El Dashboard avisa cuando los activos disponibles de esta categoría llegan a
                este número o menos.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={cancelEdit}
              className={buttonClasses({ variant: "outline" })}
            >
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              className={buttonClasses()}
            >
              <Save size={18} />
              Guardar
            </button>
          </div>
        </div>
      )}

      {/* Tabla de categorías */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-muted">
            <tr>
              <th className="table-th">
                Nombre
              </th>
              <th className="table-th">
                Descripción
              </th>
              <th className="table-th text-center">
                Req. Serie
              </th>
              <th className="table-th text-center">
                Req. IMEI
              </th>
              <th className="table-th text-center">
                Stock mínimo
              </th>
              <th className="table-th text-center">
                Activos
              </th>
              <th className="table-th text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {categories.map((category) => (
              <tr key={category.id}>
                {editingId === category.id ? (
                  <>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => cambiarNombre(e.target.value)}
                        aria-invalid={!!errores.nombre}
                        className={claseCampo(errores.nombre)}
                      />
                      <MensajeCampo mensaje={errores.nombre} />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.descripcion}
                        onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                        className="w-full px-2 py-1 border border-line-strong rounded focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={formData.requiereSerie}
                        onChange={(e) => setFormData({ ...formData, requiereSerie: e.target.checked })}
                        className="field-checkbox"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={formData.requiereImei}
                        onChange={(e) => setFormData({ ...formData, requiereImei: e.target.checked })}
                        className="field-checkbox"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <input
                        type="number"
                        min={0}
                        value={formData.stockMinimo}
                        onChange={(e) => setFormData({ ...formData, stockMinimo: parseInt(e.target.value, 10) || 0 })}
                        className="w-20 px-2 py-1 border border-line-strong rounded focus:ring-2 focus:ring-primary-500 text-center"
                      />
                    </td>
                    <td className="px-6 py-4 text-center text-fg-subtle">
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
                          className="p-1 text-fg-muted hover:bg-gray-100 rounded"
                          title="Cancelar"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-6 py-4 whitespace-nowrap font-medium text-fg">
                      {category.nombre}
                    </td>
                    <td className="px-6 py-4 text-fg-subtle">
                      {category.descripcion || "-"}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        category.requiereSerie
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-fg-muted"
                      }`}>
                        {category.requiereSerie ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 text-xs rounded-full ${
                        category.requiereImei
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-fg-muted"
                      }`}>
                        {category.requiereImei ? "Sí" : "No"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center text-fg-subtle">
                      {category.stockMinimo}
                    </td>
                    <td className="px-6 py-4 text-center text-fg-subtle">
                      {category._count?.assets || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(category)}
                          className="p-1 text-primary-700 hover:bg-primary-50 rounded"
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
                <td colSpan={7} className="px-6 py-8 text-center text-fg-subtle">
                  No hay categorías registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Confirmacion con el componente compartido, en vez del confirm()
          del navegador. */}
      <ConfirmDialog
        isOpen={confirmacion !== null}
        onClose={() => setConfirmacion(null)}
        onConfirm={() => confirmacion?.onConfirm()}
        variant="danger"
        title={confirmacion?.titulo ?? ""}
        message={confirmacion?.mensaje ?? ""}
        confirmLabel={confirmacion?.textoBoton ?? "Eliminar"}
      />
    </div>
  );
}
