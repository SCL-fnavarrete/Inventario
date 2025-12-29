"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X, Shield, ShieldCheck, ShieldAlert } from "lucide-react";

type SystemUser = {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "tecnico" | "supervisor" | "rrhh" | "auditor";
  activo: boolean;
  ultimoLogin: string | null;
  createdAt: string;
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  tecnico: "Técnico IT",
  supervisor: "Supervisor",
  rrhh: "RRHH",
  auditor: "Auditor",
};

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  tecnico: "bg-blue-100 text-blue-800",
  supervisor: "bg-purple-100 text-purple-800",
  rrhh: "bg-green-100 text-green-800",
  auditor: "bg-gray-100 text-gray-800",
};

const roleDescriptions: Record<string, string> = {
  admin: "CRUD completo, reportes, configuración",
  tecnico: "Asignar/recibir equipos, registrar mantenciones",
  supervisor: "Ver reportes de su área, aprobar solicitudes",
  rrhh: "Solo lectura de fichas de empleados y estados de devolución",
  auditor: "Solo lectura de todo el sistema",
};

export default function UsuariosPage() {
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    nombre: "",
    rol: "tecnico" as SystemUser["rol"],
    password: "",
    activo: true,
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/usuarios");
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error("Error fetching users:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.email.trim() || !formData.nombre.trim() || !formData.password.trim()) {
      setError("Email, nombre y contraseña son requeridos");
      return;
    }

    try {
      const res = await fetch("/api/usuarios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        await fetchUsers();
        setIsCreating(false);
        setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true });
        setError("");
        setSuccess("Usuario creado exitosamente");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Error al crear usuario");
      }
    } catch (err) {
      setError("Error al crear usuario");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (!formData.email.trim() || !formData.nombre.trim()) {
      setError("Email y nombre son requeridos");
      return;
    }

    try {
      const updateData: Record<string, unknown> = {
        email: formData.email,
        nombre: formData.nombre,
        rol: formData.rol,
        activo: formData.activo,
      };

      if (formData.password.trim()) {
        updateData.password = formData.password;
      }

      const res = await fetch(`/api/usuarios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updateData),
      });

      if (res.ok) {
        await fetchUsers();
        setEditingId(null);
        setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true });
        setError("");
        setSuccess("Usuario actualizado exitosamente");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Error al actualizar usuario");
      }
    } catch (err) {
      setError("Error al actualizar usuario");
      console.error(err);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Está seguro de eliminar este usuario?")) return;

    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchUsers();
        setSuccess("Usuario eliminado exitosamente");
        setTimeout(() => setSuccess(""), 3000);
      } else {
        const data = await res.json();
        setError(data.error || "Error al eliminar usuario");
      }
    } catch (err) {
      setError("Error al eliminar usuario");
      console.error(err);
    }
  };

  const toggleUserStatus = async (user: SystemUser) => {
    try {
      const res = await fetch(`/api/usuarios/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activo: !user.activo }),
      });

      if (res.ok) {
        await fetchUsers();
        setSuccess(`Usuario ${user.activo ? "desactivado" : "activado"} exitosamente`);
        setTimeout(() => setSuccess(""), 3000);
      }
    } catch (err) {
      setError("Error al cambiar estado del usuario");
      console.error(err);
    }
  };

  const startEdit = (user: SystemUser) => {
    setEditingId(user.id);
    setFormData({
      email: user.email,
      nombre: user.nombre,
      rol: user.rol,
      password: "",
      activo: user.activo,
    });
    setIsCreating(false);
    setError("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true });
    setError("");
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Nunca";
    return new Date(dateString).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
          <h1 className="text-2xl font-bold text-gray-900">Usuarios del Sistema</h1>
          <p className="text-gray-600 mt-1">Administra los usuarios y sus roles de acceso</p>
        </div>
        {!isCreating && !editingId && (
          <button
            onClick={() => {
              setIsCreating(true);
              setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus size={20} />
            <span>Nuevo Usuario</span>
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

      {/* Roles info cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {Object.entries(roleLabels).map(([key, label]) => (
          <div key={key} className="bg-white rounded-lg shadow p-3">
            <div className="flex items-center gap-2 mb-1">
              {key === "admin" ? (
                <ShieldAlert size={16} className="text-red-600" />
              ) : key === "tecnico" ? (
                <ShieldCheck size={16} className="text-blue-600" />
              ) : (
                <Shield size={16} className="text-gray-600" />
              )}
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${roleColors[key]}`}>
                {label}
              </span>
            </div>
            <p className="text-xs text-gray-500">{roleDescriptions[key]}</p>
          </div>
        ))}
      </div>

      {/* Formulario de creación/edición */}
      {(isCreating || editingId) && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {isCreating ? "Nuevo Usuario" : "Editar Usuario"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre Completo *
              </label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Nombre del usuario"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contraseña {isCreating ? "*" : "(dejar vacío para mantener)"}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder={isCreating ? "Contraseña" : "Nueva contraseña (opcional)"}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rol *
              </label>
              <select
                value={formData.rol}
                onChange={(e) => setFormData({ ...formData, rol: e.target.value as SystemUser["rol"] })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="admin">Administrador</option>
                <option value="tecnico">Técnico IT</option>
                <option value="supervisor">Supervisor</option>
                <option value="rrhh">RRHH</option>
                <option value="auditor">Auditor</option>
              </select>
            </div>
            {editingId && (
              <div className="flex items-center">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.activo}
                    onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Usuario Activo</span>
                </label>
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
              onClick={() => (isCreating ? handleCreate() : handleUpdate(editingId!))}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save size={18} />
              {isCreating ? "Crear Usuario" : "Guardar Cambios"}
            </button>
          </div>
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Usuario
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Rol
              </th>
              <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Estado
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Último Acceso
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className={!user.activo ? "bg-gray-50" : ""}>
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-gray-900">{user.nombre}</div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs rounded-full ${roleColors[user.rol]}`}>
                    {roleLabels[user.rol]}
                  </span>
                </td>
                <td className="px-6 py-4 text-center">
                  <button
                    onClick={() => toggleUserStatus(user)}
                    className={`inline-flex px-2 py-1 text-xs rounded-full cursor-pointer hover:opacity-80 ${
                      user.activo
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    }`}
                    title={user.activo ? "Clic para desactivar" : "Clic para activar"}
                  >
                    {user.activo ? "Activo" : "Inactivo"}
                  </button>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatDate(user.ultimoLogin)}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(user)}
                      className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(user.id)}
                      className="p-1 text-red-600 hover:bg-red-50 rounded"
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                  No hay usuarios registrados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
