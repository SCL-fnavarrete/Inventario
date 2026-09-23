"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { MantencionesTabs } from "@/components/mantenciones";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { ActiveBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

// Maintenance types are an editable catalog (not a fixed enum), manageable
// by both admin and technician roles, so this screen lives inside
// Mantenciones rather than the admin-only Configuracion. See MaintenanceType
// in schema.prisma and the "tiposMantencion" permission resource.

/**
 * Pending delete confirmation, shown as an in-app modal instead of the
 * browser's `confirm()`.
 */
type Confirmacion = {
  titulo: string;
  mensaje: string;
  textoBoton: string;
  onConfirm: () => void | Promise<void>;
};

type TipoMantencion = {
  id: string;
  nombre: string;
  descripcion: string | null;
  activo: boolean;
  _count?: { maintenances: number };
};

const FORM_INICIAL = {
  nombre: "",
  descripcion: "",
};

export default function TiposMantencionPage() {
  const [tipos, setTipos] = useState<TipoMantencion[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  useEffect(() => {
    fetchTipos();
  }, []);

  const fetchTipos = async () => {
    try {
      const res = await fetch("/api/mantenciones/tipos?includeCount=true");
      if (res.ok) {
        const data = await res.json();
        setTipos(data);
      }
    } catch (err) {
      console.error("Error fetching tipos de mantención:", err);
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
      const res = await fetch("/api/mantenciones/tipos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchTipos();
        setIsCreating(false);
        setFormData(FORM_INICIAL);
        setError("");
        setFieldErrors({});
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear tipo de mantención");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al crear tipo de mantención");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }

    try {
      const res = await fetch(`/api/mantenciones/tipos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchTipos();
        setEditingId(null);
        setFormData(FORM_INICIAL);
        setError("");
        setFieldErrors({});
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar tipo de mantención");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al actualizar tipo de mantención");
      console.error(err);
    }
  };

  const handleToggleActivo = async (tipo: TipoMantencion) => {
    try {
      const res = await fetch(`/api/mantenciones/tipos/${tipo.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !tipo.activo }),
      });

      if (res.ok) {
        await fetchTipos();
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al cambiar el estado del tipo");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al cambiar el estado del tipo");
      console.error(err);
    }
  };

  const pedirEliminar = (tipo: TipoMantencion) => {
    setConfirmacion({
      titulo: "Eliminar tipo de mantención",
      mensaje: `El tipo "${tipo.nombre}" se borra del catálogo y deja de aparecer al programar una mantención. No se puede deshacer; si solo quieres dejar de usarlo, desactívalo y las mantenciones ya registradas lo conservan.`,
      textoBoton: "Eliminar",
      onConfirm: () => handleDelete(tipo.id),
    });
  };

  const handleDelete = async (id: string) => {
    setConfirmacion(null);

    try {
      const res = await fetch(`/api/mantenciones/tipos/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchTipos();
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar tipo de mantención");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al eliminar tipo de mantención");
      console.error(err);
    }
  };

  const startEdit = (tipo: TipoMantencion) => {
    setEditingId(tipo.id);
    setFormData({
      nombre: tipo.nombre,
      descripcion: tipo.descripcion || "",
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-700"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mantenciones"
        description="Gestión de mantenciones preventivas y correctivas"
      />

      <MantencionesTabs />

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Tipos de Mantención</h2>
          <p className="text-gray-600 mt-1">
            Los tipos que aparecen aquí (y que estén activos) son los que se pueden elegir al
            programar una mantención.
          </p>
        </div>
        {!isCreating && !editingId && (
          <button
            onClick={() => {
              setIsCreating(true);
              setFormData(FORM_INICIAL);
            }}
            className={buttonClasses()}
          >
            <Plus size={20} />
            <span>Nuevo Tipo</span>
          </button>
        )}
      </div>

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Formulario de creación */}
      {isCreating && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Tipo de Mantención</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="field-input"
                placeholder="Ej: Preventiva, Correctiva"
              />
            </div>
            <div>
              <label className="field-label">Descripción</label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="field-input"
                placeholder="Cuándo se usa este tipo"
              />
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

      {/* Tabla de tipos */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">
                Nombre
              </th>
              <th className="table-th">
                Descripción
              </th>
              <th className="table-th text-center">
                Estado
              </th>
              <th className="table-th text-center">
                Mantenciones
              </th>
              <th className="table-th text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tipos.map((tipo) => (
              <tr key={tipo.id}>
                {editingId === tipo.id ? (
                  <>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.descripcion}
                        onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-primary-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-center text-gray-400">-</td>
                    <td className="px-6 py-4 text-center text-gray-500">
                      {tipo._count?.maintenances || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleUpdate(tipo.id)}
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
                      {tipo.nombre}
                    </td>
                    <td className="px-6 py-4 text-gray-500">{tipo.descripcion || "-"}</td>
                    <td className="px-6 py-4 text-center">
                      <ActiveBadge activo={tipo.activo} onToggle={() => handleToggleActivo(tipo)} />
                    </td>
                    <td className="px-6 py-4 text-center text-gray-500">
                      {tipo._count?.maintenances || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(tipo)}
                          className="p-1 text-primary-700 hover:bg-primary-50 rounded"
                          title="Editar"
                        >
                          <Edit size={18} />
                        </button>
                        <button
                          onClick={() => pedirEliminar(tipo)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                          title={
                            (tipo._count?.maintenances || 0) > 0
                              ? "Tiene mantenciones asociadas: desactívalo en vez de eliminarlo"
                              : "Eliminar"
                          }
                          disabled={(tipo._count?.maintenances || 0) > 0}
                        >
                          <Trash2
                            size={18}
                            className={(tipo._count?.maintenances || 0) > 0 ? "opacity-30" : ""}
                          />
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {tipos.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No hay tipos de mantención registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete confirmation modal, matching the rest of the system's style. */}
      <ConfirmDialog
        isOpen={confirmacion !== null}
        onClose={() => setConfirmacion(null)}
        onConfirm={() => confirmacion?.onConfirm()}
        variant="danger"
        title={confirmacion?.titulo ?? ""}
        message={confirmacion?.mensaje}
        confirmLabel={confirmacion?.textoBoton}
      />
    </div>
  );
}
