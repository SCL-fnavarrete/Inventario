"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, XCircle, CheckCircle } from "lucide-react";

const motivoLabels: Record<string, string> = {
  obsolescencia: "Obsolescencia",
  falla_irreparable: "Falla irreparable",
  robo: "Robo",
  extravio: "Extravío",
  otro: "Otro",
};

const condicionLabels: Record<string, string> = {
  danado: "Dañado",
  usado: "Usado",
};

type Asset = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: string;
  categoria: { nombre: string };
  assignments: { id: string; activo: boolean; employee: { nombres: string; apellidoPaterno: string } }[];
  maintenances: { id: string; estado: string }[];
};

interface BajaActivoFormProps {
  assetId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function BajaActivoForm({ assetId, onSuccess, onCancel }: BajaActivoFormProps) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);

  const [motivo, setMotivo] = useState("");
  const [motivoDetalle, setMotivoDetalle] = useState("");
  const [condicionFinal, setCondicionFinal] = useState("");

  useEffect(() => {
    fetch(`/api/activos/${assetId}`)
      .then((res) => res.json())
      .then((data) => {
        setAsset(data);
        setLoading(false);
      })
      .catch(() => {
        setError("Error al cargar el activo");
        setLoading(false);
      });
  }, [assetId]);

  const hasActiveAssignment = asset?.assignments?.some((a) => a.activo) ?? false;
  const hasActiveMaintenance =
    asset?.maintenances?.some((m) => m.estado === "pendiente" || m.estado === "en_proceso") ?? false;
  const canProceed =
    !hasActiveAssignment && !hasActiveMaintenance && asset?.estado !== "vendido" && asset?.estado !== "baja";

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/activos/${assetId}/baja`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          motivo,
          motivoDetalle: motivo === "otro" ? motivoDetalle : undefined,
          condicionFinal,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al dar de baja");
      }

      onSuccess();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="p-6 text-gray-500">Cargando...</div>;
  if (!asset) return <div className="p-6 text-red-500">Activo no encontrado</div>;

  return (
    <div className="space-y-6">
      <p className="text-gray-600">
        {asset.marca} {asset.modelo} • {asset.numeroSerie}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="text-red-500 shrink-0" size={20} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Step 1: Verificación */}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Paso 1: Verificación</h2>

          {hasActiveAssignment && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-700 font-medium">
                <AlertTriangle size={20} />
                <span>El activo tiene una asignación activa</span>
              </div>
              <p className="text-red-600 text-sm mt-1">Debe registrar la devolución antes de dar de baja.</p>
              <Link
                href={`/asignaciones/devolucion?id=${asset.assignments?.find((a) => a.activo)?.id}`}
                className="mt-2 inline-block px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
              >
                Ir a devolución
              </Link>
            </div>
          )}

          {hasActiveMaintenance && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center gap-2 text-yellow-700 font-medium">
                <AlertTriangle size={20} />
                <span>El activo está en mantención activa</span>
              </div>
              <p className="text-yellow-600 text-sm mt-1">Debe completar la mantención antes de dar de baja.</p>
            </div>
          )}

          {asset.estado === "baja" && (
            <div className="bg-gray-50 border rounded-lg p-4 text-gray-600">Este activo ya está dado de baja.</div>
          )}

          {canProceed && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-2 text-green-700">
              <CheckCircle size={20} />
              <span>El activo puede ser dado de baja. Sin bloqueos.</span>
            </div>
          )}

          <div className="flex justify-end gap-2">
            {onCancel && (
              <button onClick={onCancel} className="px-4 py-2 text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
            )}
            <button
              onClick={() => setStep(2)}
              disabled={!canProceed}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Continuar
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Formulario */}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Paso 2: Datos de Baja</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Motivo de baja *</label>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(motivoLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMotivo(key)}
                  className={`p-3 rounded-lg border text-sm text-left transition-colors ${
                    motivo === key ? "border-red-500 bg-red-50 text-red-700" : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {motivo === "otro" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Detalle del motivo *</label>
              <textarea
                value={motivoDetalle}
                onChange={(e) => setMotivoDetalle(e.target.value)}
                className="w-full border rounded-lg p-3 text-sm"
                rows={3}
                placeholder="Describa el motivo..."
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Condición final *</label>
            <div className="flex gap-2">
              {Object.entries(condicionLabels).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCondicionFinal(key)}
                  className={`px-4 py-2 rounded-lg border text-sm transition-colors ${
                    condicionFinal === key
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-700">
            <strong>Atención:</strong> Esta acción cambiará el estado del activo a &quot;Baja&quot;. Solo podrá venderse
            después.
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
              ← Volver
            </button>
            <button
              onClick={handleSubmit}
              disabled={!motivo || !condicionFinal || (motivo === "otro" && !motivoDetalle) || submitting}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Procesando..." : "Confirmar Baja"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default BajaActivoForm;