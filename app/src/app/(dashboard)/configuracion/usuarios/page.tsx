"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Plus, Edit, Save, ShieldCheck, ShieldAlert, UserX, UserCheck, KeyRound } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { formatearFechaHoraCorta } from "@/lib/utils/fechas";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { ActiveBadge } from "@/components/ui/Badge";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseCampo,
} from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { validarPasswordFuerte } from "@/lib/validations/password";
import { esCorreoValido } from "@/lib/utils/text";

const usuarioFieldLabels: Record<string, string> = {
  email: "Email",
  nombre: "Nombre",
  password: "Contraseña",
  rol: "Rol",
  sedeId: "Sede",
  activo: "Activo",
};

/**
 * Confirmacion para activar o desactivar un usuario, con el componente
 * compartido ConfirmDialog. Un usuario no se elimina: se desactiva (SPEC
 * 2.112), asi su nombre queda en la auditoria y en todo lo que hizo.
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
  sede: { id: string; codigo: string; nombre: string; activa: boolean } | null;
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
  admin: "Todo el sistema, incluida la Configuración; ve todas las sedes",
  tecnico: "Trabajo operativo de soporte, solo en su propia sede; sin acceso a Configuración",
};

export default function UsuariosPage() {
  const toast = useToast();
  const { data: session } = useSession();
  const miId = session?.user?.id;
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const editandoSedeInactiva = (() => {
    const sede = users.find((u) => u.id === editingId)?.sede;
    return sede && !sede.activa ? sede : null;
  })();
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
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, reportarServidor, limpiar } =
    useErroresFormulario(usuarioFieldLabels);

  const cambiar = (campo: keyof typeof formData, valor: string | boolean) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  };

  /**
   * Lo que falta o esta mal. La contraseña usa la misma regla que el
   * servidor: al crear es obligatoria; al editar, solo si se escribe una.
   */
  const validar = (creando: boolean) => {
    const e: Record<string, string> = {};
    if (!formData.nombre.trim()) e.nombre = "Escribe el nombre";
    if (!formData.email.trim()) e.email = "Escribe el email";
    else if (!esCorreoValido(formData.email)) e.email = "El email no es válido";
    if (creando || formData.password) {
      const errorPassword = validarPasswordFuerte(formData.password);
      if (errorPassword) e.password = errorPassword;
    }
    if (formData.rol !== "admin" && !formData.sedeId) e.sedeId = "Elige la sede de este usuario";
    return e;
  };

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
    if (reportar(validar(true))) return;

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
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al crear usuario");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (reportar(validar(false))) return;

    try {
      // El estado activo/inactivo se cambia con su propio boton, con
      // confirmacion, no desde este formulario.
      const updateData: Record<string, unknown> = {
        email: formData.email,
        nombre: formData.nombre,
        rol: formData.rol,
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
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al actualizar usuario");
      console.error(err);
    }
  };

  const pedirCambioEstado = (user: SystemUser) => {
    setConfirmacion(
      user.activo
        ? {
            titulo: "Desactivar usuario",
            mensaje: `${user.nombre} (${user.email}) no podrá iniciar sesión, y si está dentro del sistema quedará fuera en su siguiente acción. Su nombre se conserva en la auditoría y en todo lo que hizo. Puedes volver a activarlo cuando quieras.`,
            textoBoton: "Desactivar",
            onConfirm: () => toggleUserStatus(user),
          }
        : {
            titulo: "Activar usuario",
            mensaje: `${user.nombre} (${user.email}) podrá volver a iniciar sesión con su contraseña.`,
            textoBoton: "Activar",
            onConfirm: () => toggleUserStatus(user),
          }
    );
  };

  const toggleUserStatus = async (user: SystemUser) => {
    setConfirmacion(null);
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
    reportar({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({ email: "", nombre: "", rol: "tecnico", password: "", activo: true, sedeId: "" });
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

      <ResumenErrores mensaje={resumen} />
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
            <p className="text-xs text-fg-subtle">{roleDescriptions[key]}</p>
          </div>
        ))}
      </div>

      {/* Formulario de creación/edición */}
      {(isCreating || editingId) && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4">
            {isCreating ? "Nuevo Usuario" : "Editar Usuario"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CampoTexto
              label="Nombre completo"
              obligatorio
              value={formData.nombre}
              onChange={(v) => cambiar("nombre", v)}
              error={errores.nombre}
              placeholder="Nombre del usuario"
            />
            <CampoTexto
              label="Email"
              obligatorio
              type="email"
              value={formData.email}
              onChange={(v) => cambiar("email", v)}
              error={errores.email}
              placeholder="correo@ejemplo.com"
            />
            <CampoTexto
              label={isCreating ? "Contraseña" : "Contraseña (déjala vacía para mantenerla)"}
              obligatorio={isCreating}
              type="password"
              value={formData.password}
              onChange={(v) => cambiar("password", v)}
              error={errores.password}
              placeholder={isCreating ? "Contraseña" : "Nueva contraseña (opcional)"}
              ayuda={
                isCreating || editingId === miId
                  ? "Al menos 12 caracteres, con mayúscula, minúscula, número y símbolo."
                  : "Al menos 12 caracteres, con mayúscula, minúscula, número y símbolo. Si la cambias, sus sesiones abiertas se cierran."
              }
            />
            <CampoFormulario label="Rol" obligatorio>
              <select
                value={formData.rol}
                onChange={(e) => cambiar("rol", e.target.value)}
                className="field-input"
              >
                <option value="admin">Administrador</option>
                <option value="tecnico">Técnico IT</option>
              </select>
            </CampoFormulario>
            {formData.rol === "admin" ? (
              <div className="flex items-center text-sm text-fg-subtle">
                Administrador ve todas las sedes -- no se le asigna una.
              </div>
            ) : (
              <CampoFormulario
                label="Sede"
                obligatorio
                error={errores.sedeId}
                ayuda="El técnico ve y trabaja solo con los datos de su sede. El administrador ve todas."
              >
                <select
                  value={formData.sedeId}
                  onChange={(e) => cambiar("sedeId", e.target.value)}
                  aria-invalid={!!errores.sedeId}
                  className={claseCampo(errores.sedeId)}
                >
                  <option value="">Seleccionar sede...</option>
                  {sedes.map((sede) => (
                    <option key={sede.id} value={sede.id}>
                      {sede.nombre}
                    </option>
                  ))}
                  {/* La sede actual del usuario ya no esta activa: se muestra
                      para que se vea, pero no se puede volver a elegir. */}
                  {editandoSedeInactiva && (
                    <option value={editandoSedeInactiva.id} disabled>
                      {editandoSedeInactiva.nombre} (desactivada)
                    </option>
                  )}
                </select>
              </CampoFormulario>
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
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-muted">
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
          <tbody className="bg-surface divide-y divide-line">
            {users.map((user) => (
              <tr key={user.id} className={!user.activo ? "bg-surface-muted" : ""}>
                <td className="px-6 py-4">
                  <div>
                    <div className="font-medium text-fg">{user.nombre}</div>
                    <div className="text-sm text-fg-subtle">{user.email}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex px-2 py-1 text-xs rounded-full ${roleColors[user.rol]}`}>
                    {roleLabels[user.rol]}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-fg-muted">
                  {user.rol === "admin" ? (
                    <span className="text-fg-subtle">Todas</span>
                  ) : (
                    <>
                      {user.sede?.nombre || <span className="text-red-500">Sin asignar</span>}
                      {/* Su sede esta desactivada: no puede entrar (SPEC 2.112.6). */}
                      {user.sede && !user.sede.activa && (
                        <span className="mt-0.5 block text-xs text-red-600">Sede desactivada: no puede entrar</span>
                      )}
                    </>
                  )}
                </td>
                <td className="px-6 py-4 text-center">
                  <ActiveBadge activo={user.activo} />
                </td>
                <td className="px-6 py-4 text-sm text-fg-subtle">
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
                    <Link
                      href={`/configuracion/accesos?usuario=${encodeURIComponent(user.email)}`}
                      className="p-1 text-fg-muted hover:bg-surface-muted rounded"
                      title="Ver sus accesos"
                      aria-label={`Ver los accesos de ${user.nombre}`}
                    >
                      <KeyRound size={18} />
                    </Link>
                    {/* No te puedes desactivar a ti mismo (SPEC 2.112). */}
                    {user.id !== miId && (
                      <button
                        onClick={() => pedirCambioEstado(user)}
                        className={
                          user.activo
                            ? "p-1 text-red-600 hover:bg-red-50 rounded"
                            : "p-1 text-green-600 hover:bg-green-50 rounded"
                        }
                        title={user.activo ? "Desactivar" : "Activar"}
                        aria-label={`${user.activo ? "Desactivar" : "Activar"} a ${user.nombre}`}
                      >
                        {user.activo ? <UserX size={18} /> : <UserCheck size={18} />}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-fg-subtle">
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
        variant={confirmacion?.textoBoton === "Activar" ? "info" : "danger"}
        title={confirmacion?.titulo ?? ""}
        message={confirmacion?.mensaje ?? ""}
        confirmLabel={confirmacion?.textoBoton ?? "Confirmar"}
      />
    </div>
  );
}
