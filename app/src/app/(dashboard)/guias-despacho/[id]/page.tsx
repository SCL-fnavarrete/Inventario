"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Download,
  CheckCircle,
  XCircle,
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
import {
  TIPO_DESPACHO_LABELS,
  ESTADO_GUIA_LABELS,
  ESTADO_GUIA_COLORS,
  type DispatchGuideDetail,
} from "@/types/guia-despacho";
import { EstadoGuia } from "@prisma/client";

function formatDate(date: Date | string | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleDateString("es-CL", {
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
  const [guide, setGuide] = useState<DispatchGuideDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<EstadoGuia | null>(null);
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
    } catch (error) {
      console.error("Error fetching guide:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdateStatus(newStatus: EstadoGuia) {
    setUpdating(true);
    try {
      const body: Record<string, unknown> = { estado: newStatus };

      if (newStatus === EstadoGuia.recibido) {
        body.recibidoPor = recepcionData.recibidoPor;
        body.fechaRecepcion = recepcionData.fechaRecepcion;
      }

      const res = await fetch(`/api/guias-despacho/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al actualizar");
      }

      await fetchGuide();
      setShowConfirmModal(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : "Error al actualizar");
    } finally {
      setUpdating(false);
    }
  }

  async function handleDownloadPdf() {
    try {
      const response = await fetch(`/api/guias-despacho/${id}/pdf`);
      if (!response.ok) throw new Error("Error al descargar PDF");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `guia_despacho_${guide?.numero.replace(/\//g, "-")}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error("Error downloading PDF:", error);
      alert("Error al descargar el PDF");
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
        <p className="text-gray-500">Guía de despacho no encontrada</p>
        <Link
          href="/guias-despacho"
          className="mt-4 inline-block text-blue-600 hover:text-blue-800"
        >
          Volver al listado
        </Link>
      </div>
    );
  }

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
        <div className="flex gap-2">
          <button
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download size={20} />
            Descargar PDF
          </button>
        </div>
      </div>

      {/* Actions based on status */}
      {guide.estado === EstadoGuia.pendiente && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-yellow-800 mb-3">
            Esta guía está pendiente de ser despachada.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => handleUpdateStatus(EstadoGuia.despachado)}
              disabled={updating}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {updating ? <Loader2 className="animate-spin" size={20} /> : "Marcar como Despachado"}
            </button>
            <button
              onClick={() => setShowConfirmModal(EstadoGuia.anulado)}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Anular Guía
            </button>
          </div>
        </div>
      )}

      {guide.estado === EstadoGuia.despachado && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-blue-800 mb-3">
            Esta guía fue despachada y está pendiente de recepción.
          </p>
          <button
            onClick={() => setShowConfirmModal(EstadoGuia.recibido)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Confirmar Recepción
          </button>
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
              <dt className="text-sm text-gray-500">Origen</dt>
              <dd className="font-medium">{guide.origen}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Destino</dt>
              <dd className="font-medium">{guide.destino}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Tipo de Despacho</dt>
              <dd className="font-medium">{TIPO_DESPACHO_LABELS[guide.tipoDespacho]}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Despachado por</dt>
              <dd className="font-medium">{guide.despachadoPor}</dd>
            </div>
            <div>
              <dt className="text-sm text-gray-500">Fecha de Despacho</dt>
              <dd className="font-medium">{formatDateTime(guide.fechaDespacho)}</dd>
            </div>
          </dl>
        </div>

        {/* Datos del Destinatario */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <User className="text-blue-600" size={20} />
            Destinatario
          </h2>
          {guide.destinatario ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Nombre</dt>
                <dd className="font-medium">
                  {guide.destinatario.nombres} {guide.destinatario.apellidoPaterno}{" "}
                  {guide.destinatario.apellidoMaterno}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">RUT</dt>
                <dd className="font-medium">{guide.destinatario.rut || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Cargo</dt>
                <dd className="font-medium">{guide.destinatario.cargo || "-"}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Ubicación</dt>
                <dd className="font-medium">{guide.destinatario.ubicacion || "-"}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Correo</dt>
                <dd className="font-medium">{guide.destinatario.correoPersonal}</dd>
              </div>
            </dl>
          ) : guide.destinatarioNombre ? (
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Nombre</dt>
                <dd className="font-medium">{guide.destinatarioNombre}</dd>
              </div>
              {guide.destinatarioRut && (
                <div>
                  <dt className="text-sm text-gray-500">RUT</dt>
                  <dd className="font-medium">{guide.destinatarioRut}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-gray-500">No especificado</p>
          )}
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
                const categoria = asset.categoria.nombre.toLowerCase();

                let specs = "-";
                if (categoria === "notebook") {
                  const parts = [];
                  if (asset.procesador) parts.push(`Proc: ${asset.procesador}`);
                  if (asset.ram) parts.push(`RAM: ${asset.ram}`);
                  if (asset.discoDuro) parts.push(`Disco: ${asset.discoDuro}`);
                  if (asset.sistemaOperativo) parts.push(`SO: ${asset.sistemaOperativo}`);
                  specs = parts.join(" | ") || "-";
                } else if (categoria === "celular") {
                  const parts = [];
                  if (asset.numeroTelefono) parts.push(`Tel: ${asset.numeroTelefono}`);
                  if (asset.tipoPlan) parts.push(`Plan: ${asset.tipoPlan}`);
                  specs = parts.join(" | ") || "-";
                }

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

      {/* Modal de Confirmación */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            {showConfirmModal === EstadoGuia.recibido ? (
              <>
                <h3 className="text-lg font-semibold mb-4">Confirmar Recepción</h3>
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
                    onClick={() => setShowConfirmModal(null)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(EstadoGuia.recibido)}
                    disabled={updating || !recepcionData.recibidoPor}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {updating ? <Loader2 className="animate-spin" size={20} /> : "Confirmar"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-semibold mb-4">Anular Guía</h3>
                <p className="text-gray-600 mb-6">
                  ¿Está seguro que desea anular esta guía de despacho? Esta acción no se puede deshacer.
                </p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowConfirmModal(null)}
                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(EstadoGuia.anulado)}
                    disabled={updating}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                  >
                    {updating ? <Loader2 className="animate-spin" size={20} /> : "Anular"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
