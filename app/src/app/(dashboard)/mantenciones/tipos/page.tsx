"use client";

import { useState, useEffect } from "react";
import { Plus, Edit, Trash2, Save, X } from "lucide-react";
import { MantencionesTabs } from "@/modules/mantenciones/componentes";
import { parseApiError, type FieldErrors } from "@/shared/utilidades/apiErrors";
import { ApiErrorSummary } from "@/shared/ui/ApiErrorSummary";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { ActiveBadge } from "@/shared/ui/Badge";
import { PageHeader } from "@/shared/ui/PageHeader";
import { ConfirmDialog } from "@/shared/ui/ConfirmDialog";
import { MensajeCampo, ResumenErrores, claseCampo } from "@/shared/ui/CampoFormulario";
import { useErroresFormulario } from "@/shared/hooks/useErroresFormulario";
import { useEnvio } from "@/shared/hooks/useEnvio";
import { Button } from "@/shared/ui/Button";
import { TablaDatos } from "@/shared/ui/TablaDatos";
import { logger } from "@/shared/logger";

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

const ETIQUETAS = { nombre: "Nombre" };

const FORM_INICIAL = {
  nombre: "",
  descripcion: "",
};

export default function TiposMantencionPage() {
  const [tipos, setTipos] = useState<TipoMantencion[]>([]);
  const [loading, setLoading] = useState(true);
  // Una accion a la vez: un doble clic ya no crea el tipo dos veces
  // (auditoria 27-sep-2026, 6.2).
  const { enviando, ejecutar } = useEnvio();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState(FORM_INICIAL);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, reportarServidor, limpiar } = useErroresFormulario(ETIQUETAS);

  /** Nombre vacio: lo marca y no envia. */
  const faltaNombre = () => reportar(formData.nombre.trim() ? {} : { nombre: "Escribe el nombre" });

  const cambiarNombre = (nombre: string) => {
    setFormData((prev) => ({ ...prev, nombre }));
    limpiar("nombre");
  };

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
      logger.error("Error fetching tipos de mantención", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (faltaNombre()) return;

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
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al crear tipo de mantención");
      logger.error("Error en la pantalla", err);
    }
  };

  const handleUpdate = async (id: string) => {
    if (faltaNombre()) return;

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
        if (!reportarServidor(fe)) setError(message);
      }
    } catch (err) {
      setError("Error al actualizar tipo de mantención");
      logger.error("Error en la pantalla", err);
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
      logger.error("Error en la pantalla", err);
    }
  };

  const pedirEliminar = (tipo: TipoMantencion) => {
    setConfirmacion({
      titulo: "Eliminar tipo de mantención",
      mensaje: `El tipo "${tipo.nombre}" se borra del catálogo y deja de aparecer al programar una mantención. No se puede deshacer; si solo quieres dejar de usarlo, desactívalo y las mantenciones ya registradas lo conservan.`,
      textoBoton: "Eliminar",
      onConfirm: () => ejecutar(() => handleDelete(tipo.id)),
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
      logger.error("Error en la pantalla", err);
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
    limpiar("nombre");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsCreating(false);
    setFormData(FORM_INICIAL);
    setError("");
    setFieldErrors({});
    limpiar("nombre");
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
          <h2 className="text-lg font-semibold text-fg">Tipos de Mantención</h2>
          <p className="text-fg-muted mt-1">
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

      <ResumenErrores mensaje={resumen} />
      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      {/* Formulario de creación */}
      {isCreating && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-fg mb-4">Nuevo Tipo de Mantención</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="field-label">Nombre *</label>
              <input
                type="text"
                value={formData.nombre}
                onChange={(e) => cambiarNombre(e.target.value)}
                aria-invalid={!!errores.nombre}
                className={claseCampo(errores.nombre)}
                placeholder="Ej: Preventiva, Correctiva"
              />
              <MensajeCampo mensaje={errores.nombre} />
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
            <Button loading={enviando} leftIcon={<Save size={18} />} onClick={() => ejecutar(handleCreate)}>
              Guardar
            </Button>
          </div>
        </div>
      )}

      {/* Tabla de tipos */}
      <TablaDatos
        items={tipos}
        clave={(t) => t.id}
        vacio="No hay tipos de mantención registrados"
        columnas={[
          {
            titulo: "Nombre",
            celda: (t) =>
              editingId === t.id ? (
                <>
                  <input
                    type="text"
                    value={formData.nombre}
                    onChange={(e) => cambiarNombre(e.target.value)}
                    aria-invalid={!!errores.nombre}
                    className={claseCampo(errores.nombre)}
                  />
                  <MensajeCampo mensaje={errores.nombre} />
                </>
              ) : (
                <span className="whitespace-nowrap font-medium text-fg">{t.nombre}</span>
              ),
          },
          {
            titulo: "Descripción",
            className: "text-fg-subtle",
            // Ancho minimo para leerla en celular (la tabla se desliza de lado).
            celda: (t) => (
              <div className="min-w-[12rem]">
                {editingId === t.id ? (
                  <input
                    type="text"
                    value={formData.descripcion}
                    onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
                    className="w-full rounded border border-line-strong px-2 py-1 focus:ring-2 focus:ring-primary-500"
                  />
                ) : (
                  t.descripcion || "-"
                )}
              </div>
            ),
          },
          {
            titulo: "Estado",
            className: "text-center",
            celda: (t) =>
              editingId === t.id ? (
                <span className="text-fg-subtle">-</span>
              ) : (
                <ActiveBadge activo={t.activo} onToggle={() => ejecutar(() => handleToggleActivo(t))} />
              ),
          },
          { titulo: "Mantenciones", className: "text-center text-fg-subtle", celda: (t) => t._count?.maintenances || 0 },
        ]}
        acciones={(t) =>
          editingId === t.id ? (
            <>
              <button aria-label="Guardar" onClick={() => ejecutar(() => handleUpdate(t.id))} disabled={enviando} className="rounded p-1 text-green-600 hover:bg-green-50" title="Guardar">
                <Save size={18} />
              </button>
              <button aria-label="Cancelar" onClick={cancelEdit} className="rounded p-1 text-fg-muted hover:bg-gray-100" title="Cancelar">
                <X size={18} />
              </button>
            </>
          ) : (
            <>
              <button aria-label="Editar" onClick={() => startEdit(t)} className="rounded p-1 text-primary-700 hover:bg-primary-50" title="Editar">
                <Edit size={18} />
              </button>
              <button
                aria-label="Eliminar"
                onClick={() => pedirEliminar(t)}
                className="rounded p-1 text-red-600 hover:bg-red-50"
                title={(t._count?.maintenances || 0) > 0 ? "Tiene mantenciones asociadas: desactívalo en vez de eliminarlo" : "Eliminar"}
                disabled={(t._count?.maintenances || 0) > 0}
              >
                <Trash2 size={18} className={(t._count?.maintenances || 0) > 0 ? "opacity-30" : ""} />
              </button>
            </>
          )
        }
      />

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
