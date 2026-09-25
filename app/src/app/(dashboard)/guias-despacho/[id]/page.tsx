"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Package,
  MapPin,
  User,
  Calendar,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseApiError, type FieldErrors } from "@/lib/utils/apiErrors";
import { ApiErrorSummary } from "@/components/ui/ApiErrorSummary";
import { especificacionesActivoTexto } from "@/lib/utils/assetSpecs";
import {
  ESTADO_GUIA_LABELS,
  ESTADO_GUIA_COLORS,
  type DispatchGuideDetail,
} from "@/types/guia-despacho";
import { EstadoGuia } from "@prisma/client";
import {
  ahoraParaInputFechaHora,
  formatearFechaLarga,
  formatearFechaHoraCorta,
  inputFechaHoraAISO,
} from "@/lib/utils/fechas";
import { CampoTexto, ResumenErrores } from "@/components/ui/CampoFormulario";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import { ETIQUETAS_GUIA } from "@/lib/validations/guia";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { buttonClasses } from "@/components/ui/buttonStyles";

export default function GuiaDespachoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const [guide, setGuide] = useState<DispatchGuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Errors render in the shared ApiErrorSummary banner, consistent with
  // other forms, instead of a blocking browser alert().
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // La fecha parte con la hora de Chile (SPEC 2.104).
  const [recepcionData, setRecepcionData] = useState({
    recibidoPor: "",
    fechaRecepcion: ahoraParaInputFechaHora(),
  });
  // Validacion por campo, igual que el resto de los formularios (SPEC 2.95).
  const { errores, resumen, reportar, reportarServidor, limpiar } =
    useErroresFormulario(ETIQUETAS_GUIA);

  const fetchGuide = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/guias-despacho/${id}`);
      if (!res.ok) throw new Error("Error al cargar guía");
      const data = await res.json();
      setGuide(data);
    } catch (err) {
      // Surface the real error message instead of a generic "not found".
      console.error("Error fetching guide:", err);
      setError(err instanceof Error ? err.message : "Error al cargar guía");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchGuide();
  }, [fetchGuide]);

  async function handleConfirmarRecepcion() {
    if (reportar(recepcionData.recibidoPor.trim() ? {} : { recibidoPor: "Escribe quién recibió" })) return;
    setUpdating(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/guias-despacho/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recibidoPor: recepcionData.recibidoPor,
          // Instante exacto: el servidor no debe leerla en su propia zona horaria.
          fechaRecepcion: inputFechaHoraAISO(recepcionData.fechaRecepcion),
        }),
      });

      if (!res.ok) {
        // Per-field errors are listed individually rather than flattened
        // into one string; the modal stays open so the data can be fixed.
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar");
        if (!reportarServidor(fe)) setError(message);
        return;
      }

      await fetchGuide();
      setShowConfirmModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al actualizar");
    } finally {
      setUpdating(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="animate-spin mr-2" />
        <span>Cargando guía...</span>
      </div>
    );
  }

  if (!guide) {
    return (
      <div className="text-center py-12">
        {error ? (
          <div className="max-w-md mx-auto text-left">
            <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
          </div>
        ) : (
          <p className="text-fg-subtle">Guía de despacho no encontrada</p>
        )}
        <Link
          href="/guias-despacho"
          className="mt-4 inline-block text-primary-700 hover:text-primary-900"
        >
          Volver al listado
        </Link>
      </div>
    );
  }

  // Confirmar recepción es una acción de la sede DESTINO: aunque la sede
  // emisora también puede ver la guía (para saber que se despachó), no
  // tiene sentido que confirme algo que le llegó a otra sede. El backend
  // ya lo valida (403); esto solo evita mostrar un botón que va a fallar.
  const esAdmin = session?.user?.role === "admin";
  const puedeConfirmarRecepcion =
    esAdmin || session?.user?.sedeId === guide.sedeDestino.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/guias-despacho"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-fg">{guide.numero}</h1>
              <span
                className={cn(
                  "px-3 py-1 text-sm font-medium rounded-full",
                  ESTADO_GUIA_COLORS[guide.estado]
                )}
              >
                {ESTADO_GUIA_LABELS[guide.estado]}
              </span>
            </div>
            <p className="text-fg-muted">
              Creada el {formatearFechaHoraCorta(guide.createdAt, "-")}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner. When the reception modal is open, the error shows
          inside it instead (it would be hidden behind the modal overlay). */}
      {!showConfirmModal && (
        <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
      )}

      {/* Acción disponible: confirmar recepción. Es puramente informativo
          -- los equipos ya quedaron disponibles en la sede destino al
          crear la guía. La guía no se puede anular. */}
      {guide.estado === EstadoGuia.despachado && (
        <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
          <p className="text-primary-900 mb-3">
            ¿Ya llegó el paquete a {guide.sedeDestino.nombre}? Los equipos ya
            están disponibles ahí; confirma la recepción cuando lo tengas en tus manos.
          </p>
          {puedeConfirmarRecepcion ? (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-success-hover"
            >
              Confirmar Recepción
            </button>
          ) : (
            <p className="text-sm text-primary-800 italic">
              Solo un técnico de {guide.sedeDestino.nombre} puede confirmar la recepción.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datos del Despacho */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MapPin className="text-primary-700" size={20} />
            Datos del Despacho
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-fg-subtle">OT Chilexpress</dt>
              <dd className="font-medium font-mono">{guide.otChilexpress}</dd>
            </div>
            {/* Sede origen, in addition to destino. */}
            <div>
              <dt className="text-sm text-fg-subtle">Sede origen</dt>
              <dd className="font-medium">{guide.sede?.nombre || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Sede destino</dt>
              <dd className="font-medium">{guide.sedeDestino.nombre}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Emisor</dt>
              <dd className="font-medium">{guide.despachadoPor}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Fecha de envío</dt>
              <dd className="font-medium">{formatearFechaHoraCorta(guide.fechaDespacho, "-")}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">Fecha estimada de llegada</dt>
              <dd className="font-medium">{formatearFechaLarga(guide.fechaEstimadaLlegada, "-")}</dd>
            </div>
          </dl>
        </div>

        {/* Datos del Receptor */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="text-primary-700" size={20} />
            Receptor
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-fg-subtle">Nombre</dt>
              <dd className="font-medium">{guide.receptorNombre}</dd>
            </div>
            <div>
              <dt className="text-sm text-fg-subtle">RUT</dt>
              <dd className="font-medium">{guide.receptorRut}</dd>
            </div>
          </dl>
        </div>

        {/* Estado y Recepción */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="text-primary-700" size={20} />
            Estado y Recepción
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-fg-subtle">Estado Actual</dt>
              <dd>
                <span
                  className={cn(
                    "inline-flex px-2 py-1 text-sm font-medium rounded-full",
                    ESTADO_GUIA_COLORS[guide.estado]
                  )}
                >
                  {ESTADO_GUIA_LABELS[guide.estado]}
                </span>
              </dd>
            </div>
            {guide.fechaRecepcion && (
              <div>
                <dt className="text-sm text-fg-subtle">Fecha de Recepción</dt>
                <dd className="font-medium">{formatearFechaHoraCorta(guide.fechaRecepcion, "-")}</dd>
              </div>
            )}
            {guide.recibidoPor && (
              <div>
                <dt className="text-sm text-fg-subtle">Recibido por</dt>
                <dd className="font-medium">{guide.recibidoPor}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Observaciones */}
      {guide.observaciones && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="text-primary-700" size={20} />
            Observaciones
          </h2>
          <p className="text-fg-muted whitespace-pre-wrap">{guide.observaciones}</p>
        </div>
      )}

      {/* Detalle de Equipos */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="text-primary-700" size={20} />
          Equipos ({guide.items.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-line">
            <thead className="bg-surface-muted">
              <tr>
                <th className="table-th px-4">
                  Tipo
                </th>
                <th className="table-th px-4">
                  Marca / Modelo
                </th>
                <th className="table-th px-4">
                  N° Serie
                </th>
                <th className="table-th px-4">
                  IMEI
                </th>
                <th className="table-th px-4">
                  Especificaciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {guide.items.map((item) => {
                const asset = item.asset;

                // Shared helper builds specs for any category, not just
                // Notebook/Celular, avoiding a duplicated list here.
                const specs = especificacionesActivoTexto(asset) || "-";

                return (
                  <tr key={item.id} className="hover:bg-surface-muted">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded">
                          <CategoryIcon categoria={asset.categoria.nombre} className="h-5 w-5" />
                        </div>
                        <span className="text-sm">{asset.categoria.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {asset.marca} {asset.modelo}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">
                      {asset.numeroSerie || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">
                      {asset.imei || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-fg-muted">
                      {specs}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Confirmación de Recepción */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmar Recepción</h3>
            {error && (
              <div className="mb-4">
                <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
              </div>
            )}
            <div className="space-y-4 mb-6">
              <ResumenErrores mensaje={resumen} />
              <CampoTexto
                label="Recibido por"
                obligatorio
                value={recepcionData.recibidoPor}
                onChange={(v) => {
                  setRecepcionData((prev) => ({ ...prev, recibidoPor: v }));
                  limpiar("recibidoPor");
                }}
                placeholder="Nombre de quien recibe"
                error={errores.recibidoPor}
              />
              <CampoTexto
                label="Fecha de recepción"
                type="datetime-local"
                value={recepcionData.fechaRecepcion}
                onChange={(v) => setRecepcionData((prev) => ({ ...prev, fechaRecepcion: v }))}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className={buttonClasses({ variant: "outline" })}
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRecepcion}
                disabled={updating}
                className={buttonClasses({ className: "bg-success hover:bg-success-hover disabled:hover:bg-success" })}
              >
                {updating ? <Loader2 className="animate-spin" size={20} /> : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
