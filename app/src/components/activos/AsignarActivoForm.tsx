"use client";

/**
 * Formulario para entregar un equipo a una persona.
 *
 * Existe porque hasta ahora no habia forma de asignar un equipo desde la
 * interfaz: el endpoint POST /api/asignaciones estaba escrito y funcionando,
 * pero ninguna pantalla lo llamaba. El Kanban mandaba al flujo de solicitudes,
 * que es un proceso de onboarding completo, desproporcionado para registrar
 * una entrega que ya ocurrio.
 *
 * La fecha de entrega es editable a proposito. El flujo de solicitudes la fija
 * con la fecha del dia, de modo que un equipo entregado el lunes y registrado
 * el viernes queda fechado el viernes.
 */

import { useState, useEffect, useCallback } from "react";
import { Search, XCircle } from "lucide-react";

type Asset = {
  id: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  estado: string;
  categoria: { nombre: string };
};

type Employee = {
  id: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  rut: string | null;
  correo: string;
  cargo: string | null;
};

const TIPOS_MOVIMIENTO = [
  { value: "ingreso", label: "Entrega inicial" },
  { value: "cambio", label: "Cambio de equipo" },
  { value: "reemplazo", label: "Reemplazo" },
  { value: "temporal", label: "Prestamo temporal" },
] as const;

/** Estados desde los que un equipo puede entregarse (los mismos que valida la API). */
const ESTADOS_ASIGNABLES = ["disponible", "reutilizable"];

function hoyISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface AsignarActivoFormProps {
  assetId: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

export function AsignarActivoForm({ assetId, onSuccess, onCancel }: AsignarActivoFormProps) {
  const [asset, setAsset] = useState<Asset | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [step, setStep] = useState(1);

  // Paso 1: a quien se le entrega
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [buscoAlgunaVez, setBuscoAlgunaVez] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);

  // Paso 2: datos de la entrega
  const [fechaEntrega, setFechaEntrega] = useState(hoyISO());
  const [tipoMovimiento, setTipoMovimiento] = useState<string>("ingreso");
  const [lugarEntrega, setLugarEntrega] = useState("");
  const [entregadoPor, setEntregadoPor] = useState("");
  const [motivo, setMotivo] = useState("");

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

  const buscarEmpleados = useCallback(async () => {
    const termino = searchQuery.trim();
    if (!termino) return;
    setSearching(true);
    setBuscoAlgunaVez(true);
    try {
      const res = await fetch(
        `/api/empleados?search=${encodeURIComponent(termino)}&estado=activo&limit=10`
      );
      const data = await res.json();
      setEmployees(data.data || []);
    } catch {
      setEmployees([]);
      setError("No se pudo buscar empleados");
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const handleSubmit = async () => {
    if (!selectedEmployee || !fechaEntrega) return;
    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/asignaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId,
          employeeId: selectedEmployee.id,
          // Se manda al mediodia y no a medianoche: una fecha sin hora se
          // interpreta en UTC y en Chile se veria como el dia anterior.
          fechaEntrega: `${fechaEntrega}T12:00:00`,
          tipoMovimiento,
          lugarEntrega: lugarEntrega.trim() || null,
          entregadoPor: entregadoPor.trim() || null,
          motivo: motivo.trim() || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Error al asignar el equipo");
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

  const asignable = ESTADOS_ASIGNABLES.includes(asset.estado);

  return (
    <div className="space-y-6">
      <p className="text-gray-600">
        {asset.marca} {asset.modelo}
        {asset.numeroSerie && ` • ${asset.numeroSerie}`}
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <XCircle className="text-red-500 shrink-0" size={20} />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {!asignable && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-amber-800">
          Este equipo esta en estado <strong>{asset.estado}</strong> y solo se pueden
          entregar equipos disponibles o reutilizables. Si ya esta asignado y quieres
          pasarlo a otra persona, usa Reasignar.
        </div>
      )}

      {asignable && (
        <>
          {/* Paso 1: a quien */}
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Paso 1: ¿A quien se le entrega?</h2>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && buscarEmpleados()}
                  placeholder="Buscar por nombre, apellido, RUT o correo"
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  onClick={buscarEmpleados}
                  disabled={searching || !searchQuery.trim()}
                  className="px-4 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  <Search size={18} />
                </button>
              </div>

              {buscoAlgunaVez && !searching && employees.length === 0 && (
                <p className="text-sm text-gray-500">
                  No se encontraron empleados activos con ese criterio.
                </p>
              )}

              {employees.length > 0 && (
                <div className="border border-gray-200 rounded-lg divide-y max-h-64 overflow-y-auto">
                  {employees.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => setSelectedEmployee(emp)}
                      className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                        selectedEmployee?.id === emp.id ? "bg-indigo-50" : ""
                      }`}
                    >
                      <p className="font-medium text-gray-900">
                        {emp.nombres} {emp.apellidoPaterno} {emp.apellidoMaterno || ""}
                      </p>
                      <p className="text-sm text-gray-500">
                        {emp.rut || "sin RUT"}
                        {emp.cargo && ` • ${emp.cargo}`}
                      </p>
                    </button>
                  ))}
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
                  disabled={!selectedEmployee}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {/* Paso 2: datos de la entrega */}
          {step === 2 && selectedEmployee && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold">Paso 2: Datos de la entrega</h2>

              <div className="bg-gray-50 rounded-lg p-4 text-sm">
                <p className="text-gray-500 mb-1">Se entrega a:</p>
                <p className="font-medium text-gray-900">
                  {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}
                  {selectedEmployee.rut && ` • RUT: ${selectedEmployee.rut}`}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fecha de entrega *
                  </label>
                  <input
                    type="date"
                    value={fechaEntrega}
                    max={hoyISO()}
                    onChange={(e) => setFechaEntrega(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Si el equipo se entrego antes, corrige la fecha aqui.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tipo de movimiento *
                  </label>
                  <select
                    value={tipoMovimiento}
                    onChange={(e) => setTipoMovimiento(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {TIPOS_MOVIMIENTO.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Lugar de entrega
                  </label>
                  <input
                    type="text"
                    value={lugarEntrega}
                    onChange={(e) => setLugarEntrega(e.target.value)}
                    placeholder="Oficina, domicilio, sucursal..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Entregado por
                  </label>
                  <input
                    type="text"
                    value={entregadoPor}
                    onChange={(e) => setEntregadoPor(e.target.value)}
                    placeholder="Quien hace la entrega"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Motivo</label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Opcional"
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-gray-600 hover:text-gray-800"
                >
                  Volver
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !fechaEntrega}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {submitting ? "Asignando..." : "Confirmar entrega"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
