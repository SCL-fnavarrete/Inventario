"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, ShieldCheck, ShieldAlert } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatearFechaHoraCorta } from "@/lib/utils/fechas";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { ActiveBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";

const usuarioFieldLabels: Record<string, string> = {
  email: "Email",
  nombre: "Nombre",
  password: "Contraseña",
  rol: "Rol",
  sedeId: "Sede",
  activo: "Activo",
};

/**
 * Confirmacion para eliminar un usuario con el componente compartido
 * ConfirmDialog, en vez de confirm() del navegador.
 */
type Confirmacion = {
  titulo: string;
  mensaje: string;
  textoBoton: string;
  onConfirm: () => void | Promise<void>;
};

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
};

type SystemUser = {
  id: string;
  email: string;
  nombre: string;
  rol: "admin" | "tecnico";
  activo: boolean;
  ultimoLogin: string | null;
  createdAt: string;
  sedeId: string | null;
  sede: { id: string; codigo: string; nombre: string } | null;
};

const roleLabels: Record<string, string> = {
  admin: "Administrador",
  tecnico: "Técnico IT",
};

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  tecnico: "bg-primary-100 text-primary-900",
};

const roleDescriptions: Record<string, string> = {
  admin: "CRUD completo, reportes, configuración, ve todas las sedes",
  tecnico: "Trabajo operativo de soporte; ve todas las sedes, sin acceso a Configuración",
};

export default function UsuariosPage() {
  const toast = useToast();
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    nombre: "",
    rol: "tecnico" as SystemUser["rol"],
    password: "",
    activo: true,
    sedeId: "",
  });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  useEffect(() => {
    fetchUsers();
    fetchSedes();
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
    if (!formData.email.trim() || !formData.nombre.trim() || !formData.password.trim()) {
      setError("Email, nombre y contraseña son requeridos");
      return;
    }
    if (formData.rol !== "admin" && !formData.sedeId) {
      setError("Este rol necesita una sede asignada");
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
        setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true, sedeId: "" });
        setError("");
        setFieldErrors({});
        toast.success("Usuario creado exitosamente");
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear usuario");
        setError(message);
        setFieldErrors(fe);
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
    if (formData.rol !== "admin" && !formData.sedeId) {
      setError("Este rol necesita una sede asignada");
      return;
    }

    try {
      const updateData: Record<string, unknown> = {
        email: formData.email,
        nombre: formData.nombre,
        rol: formData.rol,
        activo: formData.activo,
        sedeId: formData.rol === "admin" ? null : formData.sedeId,
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
        setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true, sedeId: "" });
        setError("");
        setFieldErrors({});
        toast.success("Usuario actualizado exitosamente");
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar usuario");
        setError(message);
        setFieldErrors(fe);
      }
    } catch (err) {
      setError("Error al actualizar usuario");
      console.error(err);
    }
  };

  const pedirEliminar = (user: SystemUser) => {
    setConfirmacion({
      titulo: "Eliminar usuario",
      mensaje: `${user.nombre} (${user.email}) pierde el acceso al sistema y su cuenta se borra. No se puede deshacer; si solo quieres bloquearlo temporalmente, desactívalo en vez de eliminarlo.`,
      textoBoton: "Eliminar",
      onConfirm: () => handleDelete(user.id),
    });
  };

  const handleDelete = async (id: string) => {
    setConfirmacion(null);

    try {
      const res = await fetch(`/api/usuarios/${id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await fetchUsers();
        toast.success("Usuario eliminado exitosamente");
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar usuario");
        setError(message);
        setFieldErrors(fe);
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
        toast.success(`Usuario ${user.activo ? "desactivado" : "activado"} exitosamente`);
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al cambiar estado del usuario");
        setError(message);
        setFieldErrors(fe);
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
      sedeId: user.sedeId || "",
    });
    setIsCreating(false);
    setError("");
    setFieldErrors({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true, sedeId: "" });
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
        title="Usuarios del Sistema"
        description="Administra los usuarios y sus roles de acceso"
        actions={
          <>
            {!isCreating && !editingId && (
              <button
                onClick={() => {
                  setIsCreating(true);
                  setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true, sedeId: "" });
                  setError("");
                  setFieldErrors({});
                }}
                className={buttonClasses()}
              >
                <Plus size={20} />
                <span>Nuevo Usuario</span>
              </button>
            )}
          </>
        }
      />

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} fieldLabels={usuarioFieldLabels} />

      {/* Roles info cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {Object.entries(roleLabels).map(([key, label]) => (
          <div key={key} className="card p-3">
            <div className="flex items-center gap-2 mb-1">
              {key === "admin" ? (
                <ShieldAlert size={16} className="text-red-600" />
              ) : (
                <ShieldCheck size={16} className="text-primary-700" />
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
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            {isCreating ? "Nuevo Usuario" : "Editar Usuario"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">
                Nombre Completo *
              </label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                className="field-input"
                placeholder="Nombre del usuario"
              />
            </div>
            <div>
              <label className="field-label">
                Email *
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="field-input"
                placeholder="correo@ejemplo.com"
              />
            </div>
            <div>
              <label className="field-label">
                Contraseña {isCreating ? "*" : "(dejar vacío para mantener)"}
              </label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="field-input"
                placeholder={isCreating ? "Contraseña" : "Nueva contraseña (opcional)"}
              />
            </div>
            <div>
              <label className="field-label">
                Rol *
              </label>
              <select
                value={formData.rol}
                onChange={(e) => setFormData({ ...formData, rol: e.target.value as SystemUser["rol"] })}
                className="field-input"
              >
                <option value="admin">Administrador</option>
                <option value="tecnico">Técnico IT</option>
              </select>
            </div>
            {formData.rol === "admin" ? (
              <div className="flex items-center text-sm text-gray-500">
                Administrador ve todas las sedes -- no se le asigna una.
              </div>
            ) : (
              <div>
                <label className="field-label">Sede *</label>
                <select
                  value={formData.sedeId}
                  onChange={(e) => setFormData({ ...formData, sedeId: e.target.value })}
                  className="field-input"
                >
                  <option value="">Seleccionar sede...</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Sede que se propone por defecto en los formularios de este usuario. No limita lo que puede ver: desde el rediseño de visibilidad, admin y técnico ven todas las sedes.
                </p>
              </div>
            )}
            {editingId && (
              <div className="flex items-center">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.activo}
                    onChange={(e) => setFormData({ ...formData, activo: e.target.checked })}
                    className="field-checkbox"
                  />
                  <span className="text-sm text-gray-700">Usuario Activo</span>
                </label>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={cancelEdit}
              className={buttonClasses({ variant: "outline" })}
            >
              Cancelar
            </button>
            <button
              onClick={() => (isCreating ? handleCreate() : handleUpdate(editingId!))}
              className={buttonClasses()}
            >
              <Save size={18} />
              {isCreating ? "Crear Usuario" : "Guardar Cambios"}
            </button>
          </div>
        </div>
      )}

      {/* Tabla de usuarios */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">
                Usuario
              </th>
              <th className="table-th">
                Rol
              </th>
              <th className="table-th">
                Sede
              </th>
              <th className="table-th text-center">
                Estado
              </th>
              <th className="table-th">
                Último Acceso
              </th>
              <th className="table-th text-right">
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
                <td className="px-6 py-4 text-sm text-gray-600">
                  {user.rol === "admin" ? (
                    <span className="text-gray-400">Todas</span>
                  ) : (
                    user.sede?.nombre || <span className="text-red-500">Sin asignar</span>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <ActiveBadge activo={user.activo} onToggle={() => toggleUserStatus(user)} />
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {formatearFechaHoraCorta(user.ultimoLogin, "Nunca")}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => startEdit(user)}
                      className="p-1 text-primary-700 hover:bg-primary-50 rounded"
                      title="Editar"
                    >
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => pedirEliminar(user)}
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
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No hay usuarios registrados
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
