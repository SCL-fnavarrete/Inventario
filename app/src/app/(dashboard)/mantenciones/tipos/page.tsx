"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { MantencionesTabs } from "@/components/mantenciones";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";

// Tipos de mantención (9-sep-2026): antes era un enum fijo en el codigo/
// base de datos (Preventiva, Correctiva, etc.). Javier pidio que sea un
// catalogo editable, y que tanto admin como tecnico puedan mantenerlo --
// por eso esta pantalla vive dentro de Mantenciones (pestaña "Tipos") y no
// en Configuracion, que es admin-only. Ver MaintenanceType en
// schema.prisma y el recurso de permisos "tiposMantencion".

/**
 * Confirmacion pendiente (15-sep-2026, SPEC 2.40). Antes se preguntaba con
 * `confirm()` del navegador: se veia distinto al resto del sistema y
 * bloqueaba la ventana entera. Mismo formato que el modal de compras
 * (SPEC 2.38).
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
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Mantenciones</h1>
        <p className="text-gray-600">Gestión de mantenciones preventivas y correctivas</p>
      </div>

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
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Nuevo Tipo</span>
          </button>
        )}
      </div>

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Formulario de creación */}
      {isCreating && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nuevo Tipo de Mantención</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Preventiva, Correctiva"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
              <input
                type="text"
                value={formData.descripcion}
                onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Cuándo se usa este tipo"
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

      {/* Tabla de tipos */}
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
                Estado
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Mantenciones
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
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
                      <button
                        onClick={() => handleToggleActivo(tipo)}
                        className={`inline-flex px-2 py-1 text-xs rounded-full ${
                          tipo.activo
                            ? "bg-green-100 text-green-800 hover:bg-green-200"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}
                        title={tipo.activo ? "Click para desactivar" : "Click para activar"}
                      >
                        {tipo.activo ? "Activo" : "Inactivo"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-center text-gray-500">
                      {tipo._count?.maintenances || 0}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(tipo)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
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
