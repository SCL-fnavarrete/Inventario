"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Save, X, MapPin, Power, PowerOff } from "lucide-react";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { useToast } from "@/components/ui/Toast";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { ActiveBadge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";

type Sede = {
  id: string;
  codigo: string;
  nombre: string;
  activa: boolean;
  // Tecnicos activos y equipos vigentes, para avisar antes de desactivar.
  _count?: { usuarios: number; assets: number };
};

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

const ETIQUETAS = { codigo: "Código", nombre: "Nombre" };

export default function SedesPage() {
  const toast = useToast();
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({ codigo: "", nombre: "", activa: true });
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Sede que se va a activar/desactivar, a la espera de confirmar.
  const [cambioEstado, setCambioEstado] = useState<Sede | null>(null);
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  const cambiar = (campo: "codigo" | "nombre", valor: string) => {
    setFormData((prev) => ({ ...prev, [campo]: valor }));
    limpiar(campo);
  };

  useEffect(() => {
    fetchSedes();
  }, []);

  const fetchSedes = async () => {
    try {
      const res = await fetch("/api/sedes?conUso=true");
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
    if (
      reportar({
        ...(!formData.codigo.trim() && { codigo: "Escribe el código" }),
        ...(!formData.nombre.trim() && { nombre: "Escribe el nombre" }),
      })
    )
      return;

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
        setFieldErrors({});
        toast.success("Sede creada exitosamente");
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al crear sede");
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al crear sede");
      console.error(err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (reportar(formData.nombre.trim() ? {} : { nombre: "Escribe el nombre" })) return;

    try {
      const res = await fetch(`/api/sedes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: formData.nombre }),
      });

      if (res.ok) {
        await fetchSedes();
        setEditingId(null);
        setFormData({ codigo: "", nombre: "", activa: true });
        setError("");
        setFieldErrors({});
        toast.success("Sede actualizada exitosamente");
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar sede");
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al actualizar sede");
      console.error(err);
    }
  };

  const toggleActiva = async (sede: Sede) => {
    setCambioEstado(null);
    try {
      const res = await fetch(`/api/sedes/${sede.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activa: !sede.activa }),
      });
      if (res.ok) {
        await fetchSedes();
        toast.success(`Sede ${sede.activa ? "desactivada" : "activada"} exitosamente`);
      } else {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al cambiar el estado de la sede");
        setError(message);
        setFieldErrors(fe);
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
    setFieldErrors({});
    reportar({});
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData({ codigo: "", nombre: "", activa: true });
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
        title="Sedes"
        description="Cada activo, empleado, solicitud y despacho pertenece a una sede. El técnico trabaja solo con los datos de la suya; el administrador ve todas y el selector del menú filtra lo que muestra. Si una sede se desactiva, sus técnicos no pueden entrar."
        actions={
          <>
            {!isCreating && !editingId && (
              <button
                onClick={() => {
                  setIsCreating(true);
                  setFormData({ codigo: "", nombre: "", activa: true });
                  setError("");
                  setFieldErrors({});
                }}
                className={buttonClasses()}
              >
                <Plus size={20} />
                <span>Nueva Sede</span>
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
          <h2 className="text-lg font-semibold text-fg mb-4">Nueva Sede</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Código *</label>
              <input
                type="text"
                value={formData.codigo}
                onChange={(e) => cambiar("codigo", e.target.value.toUpperCase())}
                aria-invalid={!!errores.codigo}
                className={claseCampo(errores.codigo)}
                placeholder="Ej: STGO, CCP"
                maxLength={10}
              />
              {errores.codigo ? (
                <MensajeCampo mensaje={errores.codigo} />
              ) : (
                <p className="text-xs text-fg-subtle mt-1">
                  Código corto y estable. No se puede editar después de creada.
                </p>
              )}
            </div>
            <div>
              <label className="field-label">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => cambiar("nombre", e.target.value)}
                aria-invalid={!!errores.nombre}
                className={claseCampo(errores.nombre)}
                placeholder="Ej: Santiago, Concepción"
              />
              <MensajeCampo mensaje={errores.nombre} />
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

      {/* Tabla de sedes */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-line">
          <thead className="bg-surface-muted">
            <tr>
              <th className="table-th">
                Código
              </th>
              <th className="table-th">
                Nombre
              </th>
              <th className="table-th text-center">
                Estado
              </th>
              <th className="table-th text-right">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-line">
            {sedes.map((sede) => (
              <tr key={sede.id} className={!sede.activa ? "bg-surface-muted" : ""}>
                {editingId === sede.id ? (
                  <>
                    <td className="px-6 py-4 text-fg-subtle">{sede.codigo}</td>
                    <td className="px-6 py-4">
                      <input
                        type="text"
                        value={formData.nombre}
                        onChange={(e) => cambiar("nombre", e.target.value)}
                        aria-invalid={!!errores.nombre}
                        className={claseCampo(errores.nombre)}
                      />
                      <MensajeCampo mensaje={errores.nombre} />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ActiveBadge activo={sede.activa} labels={["Activa", "Inactiva"]} />
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
                    <td className="px-6 py-4 font-mono text-sm text-fg-muted">{sede.codigo}</td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 font-medium text-fg">
                        <MapPin size={16} className="text-fg-subtle" />
                        {sede.nombre}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <ActiveBadge activo={sede.activa} labels={["Activa", "Inactiva"]} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => startEdit(sede)}
                          className="p-1 text-primary-700 hover:bg-primary-50 rounded"
                          title="Editar"
                          aria-label={`Editar ${sede.nombre}`}
                        >
                          <Edit size={18} />
                        </button>
                        {/* Activar/desactivar con confirmacion (SPEC 2.112.6). */}
                        <button
                          onClick={() => setCambioEstado(sede)}
                          className={
                            sede.activa
                              ? "p-1 text-red-600 hover:bg-red-50 rounded"
                              : "p-1 text-green-600 hover:bg-green-50 rounded"
                          }
                          title={sede.activa ? "Desactivar" : "Activar"}
                          aria-label={`${sede.activa ? "Desactivar" : "Activar"} ${sede.nombre}`}
                        >
                          {sede.activa ? <PowerOff size={18} /> : <Power size={18} />}
                        </button>
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {sedes.length === 0 && (
              <tr>
                <td colSpan={4} className="px-6 py-8 text-center text-fg-subtle">
                  No hay sedes registradas
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        isOpen={!!cambioEstado}
        onClose={() => setCambioEstado(null)}
        onConfirm={async () => {
          if (cambioEstado) await toggleActiva(cambioEstado);
        }}
        variant={cambioEstado?.activa ? "danger" : "info"}
        title={cambioEstado?.activa ? "Desactivar sede" : "Activar sede"}
        message={
          !cambioEstado
            ? ""
            : cambioEstado.activa
              ? `${cambioEstado.nombre} tiene ${plural(cambioEstado._count?.usuarios ?? 0, "técnico activo", "técnicos activos")} y ${plural(cambioEstado._count?.assets ?? 0, "equipo", "equipos")}. Sus técnicos no podrán iniciar sesión, y los que estén dentro saldrán en su siguiente acción, hasta que los cambies de sede o la reactives. No se podrán asignar usuarios nuevos a esta sede. Los equipos y datos no se tocan.`
              : `${cambioEstado.nombre} vuelve a estar disponible y sus técnicos podrán iniciar sesión.`
        }
        confirmLabel={cambioEstado?.activa ? "Desactivar" : "Activar"}
      />
    </div>
  );
}
