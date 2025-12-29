"use client";

import { useState } from "react";
import { X, Package, AlertCircle } from "lucide-react";

interface ReturnAssetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ReturnAssetData) => Promise<void>;
  assetInfo: {
    categoria: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
  };
}

export interface ReturnAssetData {
  fechaDevolucion: string;
  recibidoPor: string;
  estadoDevolucion: "ok" | "danado" | "incompleto";
  observacionesDevolucion?: string;
}

export default function ReturnAssetModal({
  isOpen,
  onClose,
  onConfirm,
  assetInfo,
}: ReturnAssetModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ReturnAssetData>({
    fechaDevolucion: new Date().toISOString().split("T")[0],
    recibidoPor: "",
    estadoDevolucion: "ok",
    observacionesDevolucion: "",
  });

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await onConfirm(formData);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al devolver activo");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setFormData({
        fechaDevolucion: new Date().toISOString().split("T")[0],
        recibidoPor: "",
        estadoDevolucion: "ok",
        observacionesDevolucion: "",
      });
      setError(null);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            <Package className="text-blue-600" size={24} />
            <h2 className="text-xl font-semibold">Devolver Activo</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Asset Info */}
        <div className="px-6 py-4 bg-gray-50 border-b">
          <p className="text-sm text-gray-500 mb-1">Equipo a devolver</p>
          <p className="font-medium">
            {assetInfo.categoria}: {assetInfo.marca} {assetInfo.modelo}
          </p>
          {assetInfo.numeroSerie && (
            <p className="text-sm text-gray-600 font-mono">
              S/N: {assetInfo.numeroSerie}
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-4">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700">
              <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <div className="space-y-4">
            {/* Fecha Devolucion */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Fecha de Devolucion
              </label>
              <input
                type="date"
                required
                value={formData.fechaDevolucion}
                onChange={(e) =>
                  setFormData({ ...formData, fechaDevolucion: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Recibido Por */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Recibido Por
              </label>
              <input
                type="text"
                required
                maxLength={100}
                value={formData.recibidoPor}
                onChange={(e) =>
                  setFormData({ ...formData, recibidoPor: e.target.value })
                }
                placeholder="Nombre de quien recibe el equipo"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Estado Devolucion */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Estado del Equipo
              </label>
              <select
                required
                value={formData.estadoDevolucion}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    estadoDevolucion: e.target.value as "ok" | "danado" | "incompleto",
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="ok">OK - En buen estado</option>
                <option value="danado">Danado - Requiere revision</option>
                <option value="incompleto">Incompleto - Falta algo</option>
              </select>
            </div>

            {/* Observaciones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observaciones (opcional)
              </label>
              <textarea
                rows={3}
                value={formData.observacionesDevolucion}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    observacionesDevolucion: e.target.value,
                  })
                }
                placeholder="Detalles adicionales sobre la devolucion..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              />
            </div>

            {/* Info Box */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                Al confirmar, el activo cambiara automaticamente de "asignado" a{" "}
                {formData.estadoDevolucion === "ok" ? '"disponible"' : '"reutilizable"'} y
                quedara listo para ser asignado nuevamente.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? "Procesando..." : "Confirmar Devolucion"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
