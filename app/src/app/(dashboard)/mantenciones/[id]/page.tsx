"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Wrench,
  Calendar,
  User,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Trash2,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";

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
      correoPersonal: string;
      cargo: string | null;
    } | null;
  };
};

const estadoConfig: Record<string, { label: string; icon: typeof CheckCircle; color: string; bgColor: string }> = {
  pendiente: { label: "Pendiente", icon: Clock, color: "text-orange-600", bgColor: "bg-orange-100" },
  en_proceso: { label: "En Proceso", icon: Wrench, color: "text-blue-600", bgColor: "bg-blue-100" },
  completada: { label: "Completada", icon: CheckCircle, color: "text-green-600", bgColor: "bg-green-100" },
  cancelada: { label: "Cancelada", icon: XCircle, color: "text-gray-600", bgColor: "bg-gray-100" },
};

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-5 w-5" />;
    case "celular":
      return <Smartphone className="h-5 w-5" />;
    case "monitor":
      return <Monitor className="h-5 w-5" />;
    default:
      return <Package className="h-5 w-5" />;
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("es-CL");
}

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
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [showCompleteForm, setShowCompleteForm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const [completeForm, setCompleteForm] = useState({
    fechaRealizada: new Date().toISOString().split("T")[0],
    realizadoPor: "",
    resultado: "",
    resultadoTipo: "reparado" as "reparado" | "no_reparable" | "pendiente_repuestos",
    motivoBaja: "",
    proximaMantencion: "",
  });

  useEffect(() => {
    fetchMaintenance();
  }, [id]);

  async function fetchMaintenance() {
    try {
      const res = await fetch(`/api/mantenciones/${id}`);
      if (!res.ok) {
        throw new Error("Mantención no encontrada");
      }
      const data = await res.json();
      setMaintenance(data);

      // Pre-fill complete form
      setCompleteForm({
        fechaRealizada: new Date().toISOString().split("T")[0],
        realizadoPor: data.realizadoPor || "",
        resultado: "",
        resultadoTipo: "reparado",
        motivoBaja: "",
        proximaMantencion: "",
      });
    } catch (err) {
      console.error("Error fetching maintenance:", err);
      setError("Error al cargar mantención");
    } finally {
      setLoading(false);
    }
  }

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

      setShowCompleteForm(false);
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
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
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
  const canEdit = maintenance.estado === "pendiente" || maintenance.estado === "en_proceso";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/mantenciones"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Detalle de Mantención</h1>
            <p className="text-gray-600">
              {maintenance.asset.marca} {maintenance.asset.modelo}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {maintenance.estado === "pendiente" && (
            <>
              <button
                onClick={handleStartMaintenance}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <Play size={20} />
                Iniciar
              </button>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
              >
                <Trash2 size={20} />
                Eliminar
              </button>
            </>
          )}
          {maintenance.estado === "en_proceso" && (
            <>
              <button
                onClick={() => setShowCompleteForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
              >
                <CheckCircle size={20} />
                Completar
              </button>
              <button
                onClick={handleCancelMaintenance}
                disabled={submitting}
                className="flex items-center gap-2 px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
              >
                <XCircle size={20} />
                Cancelar
              </button>
            </>
          )}
        </div>
      </div>

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
          {/* Registros nuevos siempre tienen fechaProgramada (es obligatoria
              al crear). Los que no la tienen son de antes de ese cambio; en
              ese caso el estado (ej. "En Proceso") ya se entiende por si
              solo con el label de arriba, asi que no mostramos ningun
              subtitulo en vez del alarmante "Sin fecha programada". */}
          {maintenance.estado === "completada" && maintenance.fechaRealizada ? (
            <p className="text-sm text-gray-600">
              {`Completada el ${formatDate(maintenance.fechaRealizada)}`}
            </p>
          ) : maintenance.fechaProgramada ? (
            <p className="text-sm text-gray-600">
              {`Programada para ${formatDate(maintenance.fechaProgramada)}`}
            </p>
          ) : null}
        </div>
      </div>

      <ApiErrorSummary error={error || null} fieldErrors={fieldErrors} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Maintenance Info */}
        <div className="lg:col-span-2 space-y-6">
          {/* Maintenance Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Información de la Mantención</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-500">Tipo</p>
                <p className="font-medium">{maintenance.tipo.nombre}</p>
              </div>
              {/* Fecha Programada es obligatoria para mantenciones nuevas
                  (no se puede crear una sin ella), asi que en la practica
                  siempre va a haber una fecha aca. Los registros de antes
                  de esa regla no tienen fechaProgramada guardada -- en vez
                  de dejar la fila vacia o esconderla, mostramos createdAt
                  (la fecha en que se decidio mandar el equipo a
                  mantencion), que es la mejor fecha disponible para esos
                  casos. */}
              <div>
                <p className="text-sm text-gray-500">Fecha Programada</p>
                <p className="font-medium">
                  {formatDate(maintenance.fechaProgramada ?? maintenance.createdAt)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Técnico Asignado</p>
                <p className="font-medium">{maintenance.realizadoPor || "-"}</p>
              </div>
              {/* Costo/Proveedor Externo ya no se piden al crear ni al
                  completar una mantencion (es trabajo interno, sin costo).
                  Se muestran solo si el registro es de antes de ese cambio
                  y ya tenia un valor. */}
              {maintenance.costo != null && (
                <div>
                  <p className="text-sm text-gray-500">Costo</p>
                  <p className="font-medium">{formatCurrency(maintenance.costo)}</p>
                </div>
              )}
              {maintenance.proveedorExterno && (
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Proveedor Externo</p>
                  <p className="font-medium">{maintenance.proveedorExterno}</p>
                </div>
              )}
              <div className="col-span-2">
                <p className="text-sm text-gray-500">Descripción</p>
                <p className="text-gray-900 whitespace-pre-wrap">{maintenance.descripcion}</p>
              </div>
            </div>
          </div>

          {/* Result (if completed) */}
          {maintenance.estado === "completada" && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Resultado de la Mantención</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Fecha Realizada</p>
                  <p className="font-medium">{formatDate(maintenance.fechaRealizada)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Próxima Mantención</p>
                  <p className="font-medium">{formatDate(maintenance.proximaMantencion)}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-500">Resultado</p>
                  <p className="text-gray-900 whitespace-pre-wrap">{maintenance.resultado || "-"}</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column - Asset Info */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Activo</h2>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-gray-400">
                {getCategoryIcon(maintenance.asset.categoria.nombre)}
              </span>
              <div>
                <p className="font-medium">
                  {maintenance.asset.marca} {maintenance.asset.modelo}
                </p>
                <p className="text-sm text-gray-500">
                  {maintenance.asset.categoria.nombre}
                </p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">N° Serie</p>
                <p className="font-mono font-medium">{maintenance.asset.numeroSerie || "-"}</p>
              </div>
              <div>
                <p className="text-gray-500">Estado Actual</p>
                <p className="font-medium capitalize">{maintenance.asset.estado}</p>
              </div>
              <div>
                <p className="text-gray-500">Condición</p>
                <p className="font-medium capitalize">{maintenance.asset.condicion}</p>
              </div>
            </div>
            <Link
              href={`/activos/${maintenance.asset.id}`}
              className="block mt-4 text-center py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
            >
              Ver detalle del activo
            </Link>
          </div>

          {maintenance.asset.empleadoActual && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Asignado a</h2>
              <div className="space-y-3 text-sm">
                <div>
                  <p className="text-gray-500">Nombre</p>
                  <p className="font-medium">
                    {maintenance.asset.empleadoActual.nombres}{" "}
                    {maintenance.asset.empleadoActual.apellidoPaterno}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">RUT</p>
                  <p className="font-mono">{maintenance.asset.empleadoActual.rut}</p>
                </div>
                <div>
                  <p className="text-gray-500">Cargo</p>
                  <p className="font-medium">{maintenance.asset.empleadoActual.cargo || "-"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Complete Form Modal */}
      {showCompleteForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Completar Mantención</h3>
            <form onSubmit={handleCompleteMaintenance} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha Realizada *
                </label>
                <input
                  type="date"
                  required
                  value={completeForm.fechaRealizada}
                  onChange={(e) =>
                    setCompleteForm((prev) => ({ ...prev, fechaRealizada: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Realizado por *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nombre del técnico"
                  value={completeForm.realizadoPor}
                  onChange={(e) =>
                    setCompleteForm((prev) => ({ ...prev, realizadoPor: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
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
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ¿Qué pasa con el equipo? *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setCompleteForm((prev) => ({ ...prev, resultadoTipo: "reparado" }))}
                    className={`px-3 py-2 rounded-lg border text-sm font-medium ${
                      completeForm.resultadoTipo === "reparado"
                        ? "bg-green-600 text-white border-green-600"
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
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
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
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
                        : "border-gray-300 text-gray-700 hover:bg-gray-50"
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">
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
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Próxima Mantención
                </label>
                <input
                  type="date"
                  value={completeForm.proximaMantencion}
                  onChange={(e) =>
                    setCompleteForm((prev) => ({ ...prev, proximaMantencion: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex justify-end gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCompleteForm(false)}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {submitting ? "Guardando..." : "Completar Mantención"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Confirmar Eliminación</h3>
            <p className="text-gray-600 mb-4">
              ¿Está seguro de eliminar esta mantención? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
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
