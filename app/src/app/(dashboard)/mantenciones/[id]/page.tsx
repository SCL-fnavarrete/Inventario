"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Wrench,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Trash2,
  Play,
} from "lucide-react";
import { etiquetaCondicionActivo, etiquetaEstadoActivo } from "@/lib/constants/estadosActivo";
import { cn } from "@/lib/utils";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { formatearFecha } from "@/lib/utils/fechas";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { PageHeader } from "@/components/ui/PageHeader";

type Maintenance = {
  id: string;
  tipo: { id: string; nombre: string };
  descripcion: string;
  fechaProgramada: string | null;
  fechaRealizada: string | null;
  proximaMantencion: string | null;
  realizadoPor: string | null;
  costo: number | null;
  proveedorExterno: string | null;
  estado: string;
  resultado: string | null;
  createdAt: string;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    estado: string;
    condicion: string;
    categoria: {
      nombre: string;
    };
    empleadoActual: {
      id: string;
      rut: string;
      nombres: string;
      apellidoPaterno: string;
      apellidoMaterno: string | null;
      correoEmpresa: string; // required field
      correoPersonal?: string | null;
      cargo: string | null;
    } | null;
  };
};

const estadoConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string; bgColor: string }> = {
  pendiente: { label: "Pendiente", icon: Clock, color: "text-orange-600", bgColor: "bg-orange-100" },
  en_proceso: { label: "En Proceso", icon: Wrench, color: "text-primary-700", bgColor: "bg-primary-100" },
  completada: { label: "Completada", icon: CheckCircle, color: "text-green-600", bgColor: "bg-green-100" },
  cancelada: { label: "Cancelada", icon: XCircle, color: "text-fg-muted", bgColor: "bg-gray-100" },
};

function formatCurrency(amount: number | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(amount);
}

export default function MantencionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [completeForm, setCompleteForm] = useState({
    fechaRealizada: new Date().toISOString().split("T")[0],
    realizadoPor: "",
    resultado: "",
    resultadoTipo: "reparado" as "reparado" | "no_reparable" | "pendiente_repuestos",
    motivoBaja: "",
    proximaMantencion: "",
  });

  // "Realizado por" auto-fills with the current session user.
  useEffect(() => {
    if (session?.user?.name) {
      setCompleteForm((prev) => ({ ...prev, realizadoPor: session.user.name as string }));
    }
  }, [session]);

  const fetchMaintenance = useCallback(async () => {
    try {
      const res = await fetch(`/api/mantenciones/${id}`);
      if (!res.ok) {
        throw new Error("Mantención no encontrada");
      }
      const data = await res.json();
      setMaintenance(data);

      // realizadoPor is filled separately by the useEffect above, from
      // the session user.
      setCompleteForm((prev) => ({
        fechaRealizada: new Date().toISOString().split("T")[0],
        realizadoPor: prev.realizadoPor,
        resultado: "",
        resultadoTipo: "reparado",
        motivoBaja: "",
        proximaMantencion: "",
      }));
    } catch (err) {
      console.error("Error fetching maintenance:", err);
      setError("Error al cargar mantención");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMaintenance();
  }, [fetchMaintenance]);

  async function handleStartMaintenance() {
    if (!maintenance) return;

    setSubmitting(true);
    setError("");
    setFieldErrors({});

    try {
      const res = await fetch(`/api/mantenciones/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: "en_proceso",
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al iniciar mantención");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      fetchMaintenance();
    } catch (err) {
      console.error("Error starting maintenance:", err);
      setError("Error al iniciar mantención");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCompleteMaintenance(e: React.FormEvent) {
    e.preventDefault();
    if (!maintenance) return;

    setSubmitting(true);
    setError("");
    setFieldErrors({});

    try {
      const res = await fetch(`/api/mantenciones/${id}/completar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaRealizada: completeForm.fechaRealizada,
          realizadoPor: completeForm.realizadoPor,
          resultado: completeForm.resultado,
          resultadoTipo: completeForm.resultadoTipo,
          motivoBaja: completeForm.resultadoTipo === "no_reparable" ? completeForm.motivoBaja : null,
          proximaMantencion: completeForm.proximaMantencion || null,
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al completar mantención");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      fetchMaintenance();
    } catch (err) {
      console.error("Error completing maintenance:", err);
      setError("Error al completar mantención");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelMaintenance() {
    if (!maintenance) return;

    setSubmitting(true);
    setError("");
    setFieldErrors({});

    try {
      const res = await fetch(`/api/mantenciones/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          estado: "cancelada",
        }),
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al cancelar mantención");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      fetchMaintenance();
    } catch (err) {
      console.error("Error cancelling maintenance:", err);
      setError("Error al cancelar mantención");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!maintenance) return;

    setSubmitting(true);
    setError("");
    setFieldErrors({});
    try {
      const res = await fetch(`/api/mantenciones/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al eliminar");
        setError(message);
        setFieldErrors(fe);
        return;
      }

      router.push("/mantenciones");
    } catch (err) {
      console.error("Error deleting:", err);
      setError("Error al eliminar mantención");
    } finally {
      setSubmitting(false);
      setShowDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-fg-subtle" />
      </div>
    );
  }

  if (!maintenance) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-red-800">Mantención no encontrada</h2>
        <Link href="/mantenciones" className="text-red-600 hover:underline mt-2 inline-block">
          Volver al listado
        </Link>
      </div>
    );
  }

  const config = estadoConfig[maintenance.estado] || estadoConfig.pendiente;
  const StatusIcon = config.icon;

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader
        backHref="/mantenciones"
        title="Detalle de Mantención"
        description={<>{maintenance.asset.marca} {maintenance.asset.modelo}</>}
        actions={
          <>
            {maintenance.estado === "pendiente" && (
              <>
                <button
                  onClick={handleStartMaintenance}
                  disabled={submitting}
                  className={buttonClasses()}
                >
                  <Play size={20} />
                  Iniciar
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className={buttonClasses({ variant: "danger" })}
                >
                  <Trash2 size={20} />
                  Eliminar
                </button>
              </>
            )}
            {maintenance.estado === "en_proceso" && (
              <button
                onClick={handleCancelMaintenance}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle size={20} />
                Cancelar
              </button>
            )}
          </>
        }
      />

      {/* Status Banner */}
      <div
        className={cn(
          "rounded-lg p-4 flex items-center gap-3",
          config.bgColor
        )}
      >
        <StatusIcon className={cn("h-6 w-6", config.color)} />
        <div>
          <p className={cn("font-semibold", config.color)}>{config.label}</p>
          {/* fechaProgramada may be missing on older records; when absent,
              no subtitle is shown rather than an alarming placeholder. */}
          {maintenance.estado === "completada" && maintenance.fechaRealizada ? (
            <p className="text-sm text-fg-muted">
              {`Completada el ${formatearFecha(maintenance.fechaRealizada, {}, "-")}`}
            </p>
          ) : maintenance.fechaProgramada ? (
            <p className="text-sm text-fg-muted">
              {`Programada para ${formatearFecha(maintenance.fechaProgramada, {}, "-")}`}
            </p>
          ) : null}
        </div>
      </div>

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Maintenance Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Maintenance Details */}
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Información de la Mantención</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-fg-subtle">Tipo</p>
                <p className="font-medium">{maintenance.tipo.nombre}</p>
              </div>
              {/* Falls back to createdAt for older records without a
                  fechaProgramada. */}
              <div>
                <p className="text-sm text-fg-subtle">Fecha Programada</p>
                <p className="font-medium">
                  {formatearFecha(maintenance.fechaProgramada ?? maintenance.createdAt, {}, "-")}
                </p>
              </div>
              <div>
                <p className="text-sm text-fg-subtle">Técnico Asignado</p>
                <p className="font-medium">{maintenance.realizadoPor || "-"}</p>
              </div>
              {/* Costo/Proveedor Externo are legacy fields, no longer
                  collected; shown only if an older record has a value. */}
              {maintenance.costo != null && (
                <div>
                  <p className="text-sm text-fg-subtle">Costo</p>
                  <p className="font-medium">{formatCurrency(maintenance.costo)}</p>
                </div>
              )}
              {maintenance.proveedorExterno && (
                <div className="col-span-2">
                  <p className="text-sm text-fg-subtle">Proveedor Externo</p>
                  <p className="font-medium">{maintenance.proveedorExterno}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-sm text-fg-subtle">Descripción</p>
                <p className="text-fg whitespace-pre-wrap">{maintenance.descripcion}</p>
              </div>
            </div>
          </div>

          {/* Completion form is shown inline on the detail page (not a
              modal) once the maintenance is en_proceso. */}
          {maintenance.estado === "en_proceso" && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Completar Mantención</h2>
              <form onSubmit={handleCompleteMaintenance} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="field-label">
                      Fecha Realizada *
                    </label>
                    <input
                      type="date"
                      required
                      value={completeForm.fechaRealizada}
                      onChange={(e) =>
                        setCompleteForm((prev) => ({ ...prev, fechaRealizada: e.target.value }))
                      }
                      className="field-input"
                    />
                  </div>

                  <div>
                    <label className="field-label">
                      Realizado por
                    </label>
                    <input
                      type="text"
                      readOnly
                      disabled
                      value={completeForm.realizadoPor}
                      className="w-full px-4 py-2 border border-line bg-surface-muted text-fg-muted rounded-lg cursor-not-allowed"
                    />
                    <p className="text-xs text-fg-subtle mt-1">
                      Se asigna automáticamente: quien está completando la mantención.
                    </p>
                  </div>
                </div>

                <div>
                  <label className="field-label">
                    Resultado *
                  </label>
                  <textarea
                    required
                    rows={3}
                    placeholder="Describe el resultado de la mantención..."
                    value={completeForm.resultado}
                    onChange={(e) =>
                      setCompleteForm((prev) => ({ ...prev, resultado: e.target.value }))
                    }
                    className="field-input"
                  />
                </div>

                <div>
                  <label className="field-label mb-2">
                    ¿Qué pasa con el equipo? *
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setCompleteForm((prev) => ({ ...prev, resultadoTipo: "reparado" }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                        completeForm.resultadoTipo === "reparado"
                          ? "bg-green-600 text-white border-green-600"
                          : "border-line-strong text-fg-muted hover:bg-surface-muted"
                      }`}
                    >
                      Reparado
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setCompleteForm((prev) => ({ ...prev, resultadoTipo: "pendiente_repuestos" }))
                      }
                      className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                        completeForm.resultadoTipo === "pendiente_repuestos"
                          ? "bg-amber-500 text-white border-amber-500"
                          : "border-line-strong text-fg-muted hover:bg-surface-muted"
                      }`}
                    >
                      Faltan repuestos
                    </button>
                    <button
                      type="button"
                      onClick={() => setCompleteForm((prev) => ({ ...prev, resultadoTipo: "no_reparable" }))}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                        completeForm.resultadoTipo === "no_reparable"
                          ? "bg-red-600 text-white border-red-600"
                          : "border-line-strong text-fg-muted hover:bg-surface-muted"
                      }`}
                    >
                      No reparable
                    </button>
                  </div>
                  {completeForm.resultadoTipo === "pendiente_repuestos" && (
                    <p className="text-xs text-amber-700 mt-2">
                      El equipo queda en &quot;En Mantención&quot; (no vuelve a servicio) hasta que se complete una próxima mantención.
                    </p>
                  )}
                  {completeForm.resultadoTipo === "no_reparable" && (
                    <p className="text-xs text-red-700 mt-2">
                      El equipo se dará de baja automáticamente al completar esta mantención.
                    </p>
                  )}
                </div>

                {completeForm.resultadoTipo === "no_reparable" && (
                  <div>
                    <label className="field-label">
                      Motivo de la baja *
                    </label>
                    <textarea
                      required
                      rows={2}
                      placeholder="Por qué no se puede reparar..."
                      value={completeForm.motivoBaja}
                      onChange={(e) =>
                        setCompleteForm((prev) => ({ ...prev, motivoBaja: e.target.value }))
                      }
                      className="field-input"
                    />
                  </div>
                )}

                <div>
                  <label className="field-label">
                    Próxima Mantención
                  </label>
                  <input
                    type="date"
                    value={completeForm.proximaMantencion}
                    onChange={(e) =>
                      setCompleteForm((prev) => ({ ...prev, proximaMantencion: e.target.value }))
                    }
                    className="field-input"
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-success-hover disabled:opacity-50"
                  >
                    <CheckCircle size={20} />
                    {submitting ? "Guardando..." : "Completar Mantención"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Result (if completed) */}
          {maintenance.estado === "completada" && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Resultado de la Mantención</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-fg-subtle">Fecha Realizada</p>
                  <p className="font-medium">{formatearFecha(maintenance.fechaRealizada, {}, "-")}</p>
                </div>
                <div>
                  <p className="text-sm text-fg-subtle">Próxima Mantención</p>
                  <p className="font-medium">{formatearFecha(maintenance.proximaMantencion, {}, "-")}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-fg-subtle">Resultado</p>
                  <p className="text-fg whitespace-pre-wrap">{maintenance.resultado || "-"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Asset Info */}
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="text-lg font-semibold mb-4">Activo</h2>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-fg-subtle">
                <CategoryIcon categoria={maintenance.asset.categoria.nombre} className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium">
                  {maintenance.asset.marca} {maintenance.asset.modelo}
                </p>
                <p className="text-sm text-fg-subtle">
                  {maintenance.asset.categoria.nombre}
                </p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-fg-subtle">N° Serie</p>
                <p className="font-mono font-medium">{maintenance.asset.numeroSerie || "-"}</p>
              </div>
              <div>
                <p className="text-fg-subtle">Estado Actual</p>
                <p className="font-medium">{etiquetaEstadoActivo(maintenance.asset.estado)}</p>
              </div>
              <div>
                <p className="text-fg-subtle">Condición</p>
                <p className="font-medium">{etiquetaCondicionActivo(maintenance.asset.condicion)}</p>
              </div>
            </div>
            <Link
              href={`/activos/${maintenance.asset.id}`}
              className="block mt-4 text-center py-2 border border-line-strong rounded-lg text-sm text-fg-muted hover:bg-surface-muted"
            >
              Ver detalle del activo
            </Link>
          </div>

          {maintenance.asset.empleadoActual && (
            <div className="card p-6">
              <h2 className="text-lg font-semibold mb-4">Asignado a</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-fg-subtle">Nombre</p>
                  <p className="font-medium">
                    {maintenance.asset.empleadoActual.nombres}{" "}
                    {maintenance.asset.empleadoActual.apellidoPaterno}
                  </p>
                </div>
                <div>
                  <p className="text-fg-subtle">RUT</p>
                  <p className="font-mono">{maintenance.asset.empleadoActual.rut}</p>
                </div>
                <div>
                  <p className="text-fg-subtle">Cargo</p>
                  <p className="font-medium">{maintenance.asset.empleadoActual.cargo || "-"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Confirmar Eliminación</h3>
            <p className="text-fg-muted mb-4">
              ¿Está seguro de eliminar esta mantención? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className={buttonClasses({ variant: "outline" })}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className={buttonClasses({ variant: "danger" })}
              >
                {submitting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
