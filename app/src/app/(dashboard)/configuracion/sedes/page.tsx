"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Save, X, MapPin } from "lucide-react";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
};

export default function SedesPage() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ codigo: "", nombre: "", activa: true });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchSedes();
  }, []);

  const fetchSedes = async () => {
    try {
      const res = await fetch("/api/sedes");
      if (res.ok) {
        setSedes(await res.json());
      }
    } catch (err) {
      console.error("Error fetching sedes:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.codigo.trim() || !formData.nombre.trim()) {
      setError("El código y el nombre son requeridos");
      return;
    }

    try {
      const res = await fetch("/api/sedes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchSedes();
        setIsCreating(false);
        setFormData({ codigo: "", nombre: "", activa: true });
        setError("");
        setSuccess("Sede creada exitosamente");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Error al crear sede");
      }
    } catch (err) {
      setError("Error al crear sede");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.nombre.trim()) {
      setError("El nombre es requerido");
      return;
    }

    try {
      const res = await fetch(`/api/sedes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: formData.nombre, activa: formData.activa }),
      });

      if (res.ok) {
        await fetchSedes();
        setEditingId(null);
        setFormData({ codigo: "", nombre: "", activa: true });
        setError("");
        setSuccess("Sede actualizada exitosamente");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Error al actualizar sede");
      }
    } catch (err) {
      setError("Error al actualizar sede");
      console.error(err);
    }
  };

  const toggleActiva = async (sede: Sede) => {
    try {
      const res = await fetch(`/api/sedes/${sede.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !sede.activa }),
      });
      if (res.ok) {
        await fetchSedes();
        setSuccess(`Sede ${sede.activa ? "desactivada" : "activada"} exitosamente`);
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch (err) {
      setError("Error al cambiar el estado de la sede");
      console.error(err);
    }
  };

  const startEdit = (sede: Sede) => {
    setEditingId(sede.id);
    setFormData({ codigo: sede.codigo, nombre: sede.nombre, activa: sede.activa });
    setIsCreating(false);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({ codigo: "", nombre: "", activa: true });
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
          <h1 className="text-2xl font-bold text-gray-900">Sedes</h1>
          <p className="text-gray-600 mt-1">
            Cada activo, empleado, solicitud y guía de despacho queda ligado a la sede de quien
            lo registra. Un usuario solo ve y crea datos de su propia sede; el administrador ve
            todas.
          </p>
        </div>
        {!isCreating && !editingId && (
          <button
            onClick={() => {
              setIsCreating(true);
              setFormData({ codigo: "", nombre: "", activa: true });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Nueva Sede</span>
          </button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
          {success}
        </div>
      )}

      {/* Formulario de creación */}
      {isCreating && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Nueva Sede</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código *</label>
              <input
                type="text"
                value={formData.codigo}
                onChange={(e) => setFormData({ ...formData, codigo: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: STGO, CCP"
                maxLength={10}
              />
              <p className="text-xs text-gray-500 mt-1">
                Slug corto y estable. No se puede editar después de creada.
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ej: Santiago, Concepción"
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

      {/* Tabla de sedes */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Código
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Nombre
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sedes.map((sede) => (
              <tr key={sede.id} className={!sede.activa ? "bg-gray-50" : ""}>
                {editingId === sede.id ? (
                  <>
                    <td className="px-6 py-4 text-gray-500">{sede.codigo}</td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                        className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <label className="inline-flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={formData.activa}
                          onChange={(e) => setFormData({ ...formData, activa: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700">Activa</span>
                      </label>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleUpdate(sede.id)}
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
                    <td className="px-6 py-4 font-mono text-sm text-gray-700">{sede.codigo}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-medium text-gray-900">
                        <MapPin size={16} className="text-gray-400" />
                        {sede.nombre}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleActiva(sede)}
                        className={`inline-flex px-2 py-1 text-xs rounded-full cursor-pointer hover:opacity-80 ${
                          sede.activa ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                        }`}
                        title={sede.activa ? "Clic para desactivar" : "Clic para activar"}
                      >
                        {sede.activa ? "Activa" : "Inactiva"}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => startEdit(sede)}
                        className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        title="Editar"
                      >
                        <Edit size={18} />
                      </button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {sedes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-gray-500">
                  No hay sedes registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
