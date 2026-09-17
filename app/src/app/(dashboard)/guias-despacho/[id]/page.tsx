"use client";

import { useState, useEffect, use } from "react";
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
  Laptop,
  Smartphone,
  Monitor,
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
import { formatearFecha } from "@/lib/utils/fechas";

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return formatearFecha(date, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("es-CL", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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
  // Esta pantalla mostraba los errores con alert() del navegador, distinto
  // al resto del sistema y sin poder listar el detalle por campo que la API
  // ya devuelve en `details` (15-sep-2026, SPEC 2.40). Con estado propio el
  // error se muestra en el mismo cartel ApiErrorSummary que usan los demas
  // formularios, sin bloquear la ventana.
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [recepcionData, setRecepcionData] = useState({
    recibidoPor: "",
    fechaRecepcion: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    fetchGuide();
  }, [id]);

  async function fetchGuide() {
    setLoading(true);
    try {
      const res = await fetch(`/api/guias-despacho/${id}`);
      if (!res.ok) throw new Error("Error al cargar guía");
      const data = await res.json();
      setGuide(data);
    } catch (err) {
      // Si la carga falla, antes solo quedaba registro en la consola y la
      // pagina decia "Guia no encontrada" aunque el problema fuera de red
      // (15-sep-2026, SPEC 2.40): ahora el motivo se ve en el cartel.
      console.error("Error fetching guide:", err);
      setError(err instanceof Error ? err.message : "Error al cargar guía");
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmarRecepcion() {
    setUpdating(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch(`/api/guias-despacho/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recibidoPor: recepcionData.recibidoPor,
          fechaRecepcion: recepcionData.fechaRecepcion,
        }),
      });

      if (!res.ok) {
        // El detalle por campo ya no se aplasta dentro de un solo string:
        // el cartel lo lista campo por campo con su nombre legible
        // (15-sep-2026, SPEC 2.40). El modal queda abierto para que se
        // pueda corregir el dato sin volver a abrirlo.
        const { message, fieldErrors: fe } = await parseApiError(res, "Error al actualizar");
        setError(message);
        setFieldErrors(fe);
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
          <p className="text-gray-500">Guía de despacho no encontrada</p>
        )}
        <Link
          href="/guias-despacho"
          className="mt-4 inline-block text-blue-600 hover:text-blue-800"
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
              <h1 className="text-2xl font-bold text-gray-900">{guide.numero}</h1>
              <span
                className={cn(
                  "px-3 py-1 text-sm font-medium rounded-full",
                  ESTADO_GUIA_COLORS[guide.estado]
                )}
              >
                {ESTADO_GUIA_LABELS[guide.estado]}
              </span>
            </div>
            <p className="text-gray-600">
              Creada el {formatDateTime(guide.createdAt)}
            </p>
          </div>
        </div>
      </div>

      {/* Cartel de error de la pagina. Cuando el modal de recepcion esta
          abierto el error se muestra adentro del modal (si no, quedaria
          tapado por el fondo oscuro) -- 15-sep-2026, SPEC 2.40. */}
      {!showConfirmModal && (
        <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
      )}

      {/* Acción disponible: confirmar recepción. Es puramente informativo
          -- los equipos ya quedaron disponibles en la sede destino al
          crear la guía. La guía no se puede anular. */}
      {guide.estado === EstadoGuia.despachado && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 mb-3">
            ¿Ya llegó el paquete a {guide.sedeDestino.nombre}? Los equipos ya
            están disponibles ahí; confirma la recepción cuando lo tengas en tus manos.
          </p>
          {puedeConfirmarRecepcion ? (
            <button
              onClick={() => setShowConfirmModal(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Confirmar Recepción
            </button>
          ) : (
            <p className="text-sm text-blue-700 italic">
              Solo un técnico de {guide.sedeDestino.nombre} puede confirmar la recepción.
            </p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Datos del Despacho */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <MapPin className="text-blue-600" size={20} />
            Datos del Despacho
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">OT Chilexpress</dt>
              <dd className="font-medium font-mono">{guide.otChilexpress}</dd>
            </div>
            {/* Sede origen ademas de destino (18-sep-2026, SPEC 2.9.9): el
                dato ya venia de la API, solo no se mostraba. */}
            <div>
              <dt className="text-sm text-gray-500">Sede origen</dt>
              <dd className="font-medium">{guide.sede?.nombre || "—"}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Sede destino</dt>
              <dd className="font-medium">{guide.sedeDestino.nombre}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Emisor</dt>
              <dd className="font-medium">{guide.despachadoPor}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Fecha de envío</dt>
              <dd className="font-medium">{formatDateTime(guide.fechaDespacho)}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Fecha estimada de llegada</dt>
              <dd className="font-medium">{formatDate(guide.fechaEstimadaLlegada)}</dd>
            </div>
          </dl>
        </div>

        {/* Datos del Receptor */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="text-blue-600" size={20} />
            Receptor
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Nombre</dt>
              <dd className="font-medium">{guide.receptorNombre}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">RUT</dt>
              <dd className="font-medium">{guide.receptorRut}</dd>
            </div>
          </dl>
        </div>

        {/* Estado y Recepción */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="text-blue-600" size={20} />
            Estado y Recepción
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-sm text-gray-500">Estado Actual</dt>
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
                <dt className="text-sm text-gray-500">Fecha de Recepción</dt>
                <dd className="font-medium">{formatDateTime(guide.fechaRecepcion)}</dd>
              </div>
            )}
            {guide.recibidoPor && (
              <div>
                <dt className="text-sm text-gray-500">Recibido por</dt>
                <dd className="font-medium">{guide.recibidoPor}</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Observaciones */}
      {guide.observaciones && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <FileText className="text-blue-600" size={20} />
            Observaciones
          </h2>
          <p className="text-gray-700 whitespace-pre-wrap">{guide.observaciones}</p>
        </div>
      )}

      {/* Detalle de Equipos */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Package className="text-blue-600" size={20} />
          Equipos ({guide.items.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Tipo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Marca / Modelo
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  N° Serie
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  IMEI
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Especificaciones
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {guide.items.map((item) => {
                const asset = item.asset;

                // Antes esto solo sabia armar specs para Notebook/Celular
                // (14-sep-2026, SPEC 2.26): un Monitor o un periferico
                // mostraban "-" aunque la API ya traia pulgadas/
                // conectividad. Se reemplaza por el mismo helper que ya
                // usan el detalle de Activos y el selector de Guias
                // (assetSpecs.ts, SPEC 2.19) para no mantener esta lista
                // duplicada en un tercer lugar.
                const specs = especificacionesActivoTexto(asset) || "-";

                return (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-gray-100 rounded">
                          {getCategoryIcon(asset.categoria.nombre)}
                        </div>
                        <span className="text-sm">{asset.categoria.nombre}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {asset.marca} {asset.modelo}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {asset.numeroSerie || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {asset.imei || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
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
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Confirmar Recepción</h3>
            {error && (
              <div className="mb-4">
                <ApiErrorSummary error={error} fieldErrors={fieldErrors} />
              </div>
            )}
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recibido por <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={recepcionData.recibidoPor}
                  onChange={(e) =>
                    setRecepcionData((prev) => ({ ...prev, recibidoPor: e.target.value }))
                  }
                  placeholder="Nombre de quien recibe"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Recepción
                </label>
                <input
                  type="datetime-local"
                  value={recepcionData.fechaRecepcion}
                  onChange={(e) =>
                    setRecepcionData((prev) => ({ ...prev, fechaRecepcion: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmarRecepcion}
                disabled={updating || !recepcionData.recibidoPor}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
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
