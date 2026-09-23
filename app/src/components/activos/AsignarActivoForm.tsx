"use client";

/**
 * Formulario para entregar un equipo a una persona (POST /api/asignaciones).
 *
 * La fecha de entrega es editable para poder registrar entregas retroactivas.
 */

import { useState, useEffect, useCallback } from "react";
import { Search, XCircle } from "lucide-react";
import { etiquetaEstadoActivo } from "@/lib/constants/estadosActivo";

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
  // Identificador principal de la persona en la UI.
  correoEmpresa: string;
  correoPersonal?: string | null;
  cargo: string | null;
};

const TIPOS_MOVIMIENTO = [
  { value: "ingreso", label: "Entrega inicial" },
  { value: "cambio", label: "Cambio de equipo" },
  { value: "reemplazo", label: "Reemplazo" },
  { value: "temporal", label: "Prestamo temporal" },
] as const;

/** Estados desde los que un equipo puede entregarse (los mismos que valida la API). */
const ESTADOS_ASIGNABLES = ["disponible"];

/**
 * Propone el nombre de red del equipo a partir de la persona que lo recibe,
 * siguiendo la convencion SCL + inicial del nombre + apellido paterno.
 * Queda editable porque choques de apellido requieren ajustarlo a mano.
 */
export function sugerirNombreEquipo(nombres: string, apellidoPaterno: string): string {
  const limpiar = (t: string) =>
    (t || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z]/g, "")
      .toUpperCase();
  const inicial = limpiar(nombres).charAt(0);
  const apellido = limpiar(apellidoPaterno);
  if (!inicial || !apellido) return "";
  return `SCL-${inicial}${apellido}`;
}

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
  // Nombre del equipo en la red (hostname). Se propone solo al elegir a la
  // persona y queda editable -- ver sugerirNombreEquipo.
  const [nombreEquipo, setNombreEquipo] = useState("");

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
          // El nombre de red viaja con la entrega y la API lo guarda en el activo.
          nombreEquipo: nombreEquipo.trim() || null,
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

  if (loading) return <div className="p-6 text-fg-subtle">Cargando...</div>;
  if (!asset) return <div className="p-6 text-red-500">Activo no encontrado</div>;

  const asignable = ESTADOS_ASIGNABLES.includes(asset.estado);

  return (
    <div className="space-y-6">
      <p className="text-fg-muted">
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
          Este equipo está en estado <strong>{etiquetaEstadoActivo(asset.estado)}</strong> y solo se pueden
          entregar equipos disponibles. Si ya está asignado y quieres
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
                  className="field-input flex-1"
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
                <p className="text-sm text-fg-subtle">
                  No se encontraron empleados activos con ese criterio.
                </p>
              )}

              {employees.length > 0 && (
                <div className="border border-line rounded-lg divide-y max-h-64 overflow-y-auto">
                  {employees.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => {
                        setSelectedEmployee(emp);
                        // Se propone el nombre de red de una vez; si el
                        // tecnico ya escribio uno, no se pisa.
                        setNombreEquipo((actual) =>
                          actual.trim()
                            ? actual
                            : sugerirNombreEquipo(emp.nombres, emp.apellidoPaterno)
                        );
                      }}
                      className={`w-full text-left px-4 py-3 hover:bg-surface-muted transition-colors ${
                        selectedEmployee?.id === emp.id ? "bg-primary-50" : ""
                      }`}
                    >
                      <p className="font-medium text-fg">
                        {emp.nombres} {emp.apellidoPaterno} {emp.apellidoMaterno || ""}
                      </p>
                      <p className="text-sm text-fg-subtle">
                        {emp.rut || "sin RUT"}
                        {emp.cargo && ` • ${emp.cargo}`}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              <div className="flex justify-end gap-2">
                {onCancel && (
                  <button onClick={onCancel} className="px-4 py-2 text-fg-muted hover:text-fg">
                    Cancelar
                  </button>
                )}
                <button
                  onClick={() => setStep(2)}
                  disabled={!selectedEmployee}
                  className="px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50"
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

              <div className="bg-surface-muted rounded-lg p-4 text-sm">
                <p className="text-fg-subtle mb-1">Se entrega a:</p>
                <p className="font-medium text-fg">
                  {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}
                  {selectedEmployee.rut && ` • RUT: ${selectedEmployee.rut}`}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="field-label">
                    Fecha de entrega *
                  </label>
                  <input
                    type="date"
                    value={fechaEntrega}
                    max={hoyISO()}
                    onChange={(e) => setFechaEntrega(e.target.value)}
                    className="field-input"
                  />
                  <p className="mt-1 text-xs text-fg-subtle">
                    Si el equipo se entregó antes, corrige la fecha aquí.
                  </p>
                </div>

                <div>
                  <label className="field-label">
                    Tipo de movimiento *
                  </label>
                  <select
                    value={tipoMovimiento}
                    onChange={(e) => setTipoMovimiento(e.target.value)}
                    className="field-input"
                  >
                    {TIPOS_MOVIMIENTO.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="field-label">
                    Lugar de entrega
                  </label>
                  <input
                    type="text"
                    value={lugarEntrega}
                    onChange={(e) => setLugarEntrega(e.target.value)}
                    placeholder="Oficina, domicilio, sucursal..."
                    className="field-input"
                  />
                </div>

                <div>
                  <label className="field-label">
                    Entregado por
                  </label>
                  <input
                    type="text"
                    value={entregadoPor}
                    onChange={(e) => setEntregadoPor(e.target.value)}
                    placeholder="Quien hace la entrega"
                    className="field-input"
                  />
                </div>
              </div>

              <div>
                <label className="field-label">
                  Nombre del equipo en la red
                </label>
                <input
                  type="text"
                  value={nombreEquipo}
                  onChange={(e) => setNombreEquipo(e.target.value)}
                  placeholder="Ej: SCL-CROJAS"
                  className="field-input"
                />
                <p className="mt-1 text-xs text-fg-subtle">
                  Se propone según la convención de la empresa (SCL + inicial del nombre +
                  apellido). Puedes cambiarlo si ya está tomado. Opcional: si el equipo se
                  renombra después, se puede completar desde la ficha del activo.
                </p>
              </div>

              <div>
                <label className="field-label">Motivo</label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={2}
                  placeholder="Opcional"
                  className="field-input"
                />
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-fg-muted hover:text-fg"
                >
                  Volver
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !fechaEntrega}
                  className="px-6 py-2 bg-brand text-white rounded-lg hover:bg-brand-hover disabled:opacity-50"
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
