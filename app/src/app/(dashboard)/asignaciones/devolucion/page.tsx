"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Undo2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  User,
  Calendar,
  MapPin,
  AlertCircle,
  CheckCircle,
  Loader2,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  fechaEntrega: string;
  fechaDevolucion: string | null;
  lugarEntrega: string | null;
  entregadoPor: string | null;
  tipoMovimiento: string;
  activo: boolean;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    categoria: {
      nombre: string;
    };
  };
  employee: {
    id: string;
    rut: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
  };
};

type Employee = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correo: string;
  cargo: string | null;
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

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("es-CL");
}

export default function DevolucionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedId = searchParams.get("id");

  const [step, setStep] = useState(1);
  const [rutSearch, setRutSearch] = useState("");
  const [searching, setSearching] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [selectedAssignments, setSelectedAssignments] = useState<string[]>([]);
  const [entregaData, setEntregaData] = useState({
    fechaDevolucion: new Date().toISOString().split("T")[0],
    recibidoPor: "",
  });
  type DetalleDevolucion = { estadoDevolucion: "ok" | "incompleto" | "danado"; observaciones: string };
  const [detallesPorEquipo, setDetallesPorEquipo] = useState<Record<string, DetalleDevolucion>>({});

  function detalleDe(assignmentId: string): DetalleDevolucion {
    return detallesPorEquipo[assignmentId] ?? { estadoDevolucion: "ok", observaciones: "" };
  }

  function actualizarDetalle(assignmentId: string, patch: Partial<DetalleDevolucion>) {
    setDetallesPorEquipo((prev) => ({ ...prev, [assignmentId]: { ...detalleDe(assignmentId), ...patch } }));
  }
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  // Si viene con ID preseleccionado, cargar esa asignación
  useEffect(() => {
    if (preselectedId) {
      loadAssignmentById(preselectedId);
    }
  }, [preselectedId]);

  async function loadAssignmentById(id: string) {
    try {
      const res = await fetch(`/api/asignaciones/${id}`);
      if (!res.ok) throw new Error("Asignación no encontrada");

      const assignment = await res.json();
      if (!assignment.activo) {
        setError("Esta asignación ya fue devuelta");
        return;
      }

      setEmployee(assignment.employee);
      setAssignments([assignment]);
      setSelectedAssignments([assignment.id]);
      setStep(2);
    } catch (err) {
      setError("Error al cargar la asignación");
    }
  }

  async function searchByRut() {
    if (!rutSearch.trim()) return;

    setSearching(true);
    setError("");
    setEmployee(null);
    setAssignments([]);

    try {
      // Buscar empleado por RUT
      const empRes = await fetch(`/api/empleados/buscar?rut=${encodeURIComponent(rutSearch)}`);
      if (!empRes.ok) {
        setError("Empleado no encontrado");
        return;
      }

      const emp = await empRes.json();
      setEmployee(emp);

      // Buscar asignaciones activas del empleado
      const assignRes = await fetch(`/api/asignaciones?employeeId=${emp.id}&activo=true&limit=50`);
      const assignData = await assignRes.json();

      if (assignData.data.length === 0) {
        setError("Este empleado no tiene equipos asignados actualmente");
        return;
      }

      setAssignments(assignData.data);
      setStep(2);
    } catch (err) {
      setError("Error al buscar empleado");
    } finally {
      setSearching(false);
    }
  }

  function toggleAssignment(id: string) {
    setSelectedAssignments((prev) =>
      prev.includes(id)
        ? prev.filter((a) => a !== id)
        : [...prev, id]
    );
    setDetallesPorEquipo((prev) => {
      if (!(id in prev)) return prev;
      const { [id]: _omit, ...rest } = prev;
      return rest;
    });
  }

  function selectAll() {
    if (selectedAssignments.length === assignments.length) {
      setSelectedAssignments([]);
    } else {
      setSelectedAssignments(assignments.map((a) => a.id));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (selectedAssignments.length === 0) {
      setError("Debe seleccionar al menos un equipo para devolver");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      // Procesar cada devolución con su propio estado y observaciones
      for (const assignmentId of selectedAssignments) {
        const detalle = detalleDe(assignmentId);
        const res = await fetch(`/api/asignaciones/${assignmentId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fechaDevolucion: entregaData.fechaDevolucion,
            recibidoPor: entregaData.recibidoPor,
            estadoDevolucion: detalle.estadoDevolucion,
            observacionesDevolucion: detalle.observaciones,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Error al procesar devolución");
        }
      }

      setSuccess(true);
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar devolución");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/asignaciones"
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Registrar Devolución</h1>
          <p className="text-gray-600">
            Proceso de devolución de equipos asignados
          </p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          {[
            { num: 1, label: "Buscar Empleado" },
            { num: 2, label: "Seleccionar Equipos" },
            { num: 3, label: "Datos Devolución" },
            { num: 4, label: "Confirmación" },
          ].map((s, idx) => (
            <div key={s.num} className="flex items-center">
              <div className="flex items-center">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
                    step >= s.num
                      ? "bg-orange-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  )}
                >
                  {step > s.num ? <CheckCircle size={16} /> : s.num}
                </div>
                <span
                  className={cn(
                    "ml-2 text-sm hidden sm:inline",
                    step >= s.num ? "text-gray-900 font-medium" : "text-gray-500"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {idx < 3 && (
                <div
                  className={cn(
                    "w-12 sm:w-24 h-1 mx-2",
                    step > s.num ? "bg-orange-600" : "bg-gray-200"
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700">{error}</p>
        </div>
      )}

      {/* Step 1: Search Employee */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Buscar Empleado por RUT</h2>
          <div className="max-w-md">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Ingrese RUT (ej: 12.345.678-9)"
                  value={rutSearch}
                  onChange={(e) => setRutSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchByRut()}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                />
              </div>
              <button
                onClick={searchByRut}
                disabled={searching || !rutSearch.trim()}
                className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
              >
                {searching ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Search size={20} />
                )}
                Buscar
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              Ingrese el RUT del empleado que realizará la devolución
            </p>
          </div>
        </div>
      )}

      {/* Step 2: Select Equipment */}
      {step === 2 && employee && (
        <div className="space-y-4">
          {/* Employee Info */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-orange-100 rounded-full">
                <User className="h-6 w-6 text-orange-600" />
              </div>
              <div>
                <p className="font-semibold text-lg">
                  {employee.nombres} {employee.apellidoPaterno} {employee.apellidoMaterno}
                </p>
                <p className="text-gray-500">{employee.rut}</p>
                {employee.cargo && (
                  <p className="text-sm text-gray-400">{employee.cargo}</p>
                )}
              </div>
              <button
                onClick={() => {
                  setStep(1);
                  setEmployee(null);
                  setAssignments([]);
                  setSelectedAssignments([]);
                }}
                className="ml-auto text-sm text-orange-600 hover:underline"
              >
                Cambiar empleado
              </button>
            </div>
          </div>

          {/* Equipment List */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">
                Equipos Asignados ({assignments.length})
              </h2>
              <button
                onClick={selectAll}
                className="text-sm text-orange-600 hover:underline"
              >
                {selectedAssignments.length === assignments.length
                  ? "Deseleccionar todos"
                  : "Seleccionar todos"}
              </button>
            </div>

            <div className="space-y-3">
              {assignments.map((assignment) => {
                const devuelto = selectedAssignments.includes(assignment.id);
                const detalle = detalleDe(assignment.id);
                const opcionesEstado: { value: DetalleDevolucion["estadoDevolucion"]; label: string; className: string }[] = [
                  { value: "ok", label: "Buen Estado", className: "border-green-500 bg-green-50 text-green-700" },
                  { value: "incompleto", label: "Incompleto", className: "border-amber-500 bg-amber-50 text-amber-700" },
                  { value: "danado", label: "Dañado", className: "border-red-500 bg-red-50 text-red-700" },
                ];
                return (
                  <div
                    key={assignment.id}
                    className={cn(
                      "border rounded-lg transition-colors",
                      devuelto ? "border-orange-500 bg-orange-50" : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <div
                      onClick={() => toggleAssignment(assignment.id)}
                      className="p-4 flex items-center gap-4 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={devuelto}
                        onChange={() => toggleAssignment(assignment.id)}
                        className="h-5 w-5 text-orange-600 rounded"
                      />
                      <div className="p-2 bg-gray-100 rounded-lg">
                        {getCategoryIcon(assignment.asset.categoria.nombre)}
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">
                          {assignment.asset.marca} {assignment.asset.modelo}
                        </p>
                        <p className="text-sm text-gray-500">
                          {assignment.asset.categoria.nombre} • Serie: {assignment.asset.numeroSerie || "-"}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="text-gray-500">Entregado</p>
                        <p className="font-medium">{formatDate(assignment.fechaEntrega)}</p>
                      </div>
                    </div>

                    {devuelto && (
                      <div className="px-4 pb-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                        <div className="grid grid-cols-3 gap-2">
                          {opcionesEstado.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => actualizarDetalle(assignment.id, { estadoDevolucion: opt.value })}
                              className={cn(
                                "p-2 border-2 rounded-lg text-xs font-medium transition-colors",
                                detalle.estadoDevolucion === opt.value ? opt.className : "border-gray-200 hover:border-gray-300"
                              )}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <textarea
                          rows={2}
                          placeholder="Observaciones de este equipo (opcional)"
                          value={detalle.observaciones}
                          onChange={(e) => actualizarDetalle(assignment.id, { observaciones: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-between">
              <button
                onClick={() => {
                  setStep(1);
                  setEmployee(null);
                  setAssignments([]);
                  setSelectedAssignments([]);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={selectedAssignments.length === 0}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                Continuar ({selectedAssignments.length} seleccionados)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Return Data */}
      {step === 3 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Datos de la Devolución</h2>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Devolución *
                </label>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="date"
                    required
                    value={entregaData.fechaDevolucion}
                    onChange={(e) =>
                      setEntregaData((prev) => ({ ...prev, fechaDevolucion: e.target.value }))
                    }
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recibido por
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Nombre de quien recibe"
                    value={entregaData.recibidoPor}
                    onChange={(e) =>
                      setEntregaData((prev) => ({ ...prev, recibidoPor: e.target.value }))
                    }
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4">
              <h3 className="font-medium mb-3">Resumen de Devolución</h3>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-gray-500">Empleado:</span>{" "}
                  {employee?.nombres} {employee?.apellidoPaterno}
                </p>
                <p>
                  <span className="text-gray-500">Equipos a devolver:</span>{" "}
                  {selectedAssignments.length}
                </p>
                <ul className="list-disc list-inside pl-2 text-gray-600">
                  {assignments
                    .filter((a) => selectedAssignments.includes(a.id))
                    .map((a) => {
                      const estadoLabel = { ok: "Buen estado", incompleto: "Incompleto", danado: "Dañado" }[
                        detalleDe(a.id).estadoDevolucion
                      ];
                      return (
                        <li key={a.id}>
                          {a.asset.marca} {a.asset.modelo} ({a.asset.numeroSerie || "S/N"}) — {estadoLabel}
                        </li>
                      );
                    })}
                </ul>
              </div>
            </div>

            <div className="flex justify-between">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Atrás
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 flex items-center gap-2"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    <Undo2 size={20} />
                    Confirmar Devolución
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Step 4: Success */}
      {step === 4 && success && (
        <div className="bg-white rounded-lg shadow p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            ¡Devolución Registrada!
          </h2>
          <p className="text-gray-600 mb-6">
            Se han devuelto {selectedAssignments.length} equipo(s) correctamente
          </p>

          <div className="bg-gray-50 rounded-lg p-4 mb-6 max-w-md mx-auto">
            <p className="text-sm text-gray-600 mb-2">Equipos devueltos:</p>
            <ul className="text-sm">
              {assignments
                .filter((a) => selectedAssignments.includes(a.id))
                .map((a) => (
                  <li key={a.id} className="flex items-center justify-between py-1">
                    <span>
                      {a.asset.marca} {a.asset.modelo}
                    </span>
                    <a
                      href={`/api/asignaciones/${a.id}/acta?tipo=devolucion`}
                      target="_blank"
                      className="text-orange-600 hover:underline flex items-center gap-1"
                    >
                      <FileText size={14} />
                      Acta
                    </a>
                  </li>
                ))}
            </ul>
          </div>

          <div className="flex justify-center gap-4">
            <Link
              href="/asignaciones"
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Ver Asignaciones
            </Link>
            <button
              onClick={() => {
                setStep(1);
                setEmployee(null);
                setAssignments([]);
                setSelectedAssignments([]);
                setSuccess(false);
                setDetallesPorEquipo({});
                setEntregaData({
                  fechaDevolucion: new Date().toISOString().split("T")[0],
                  recibidoPor: "",
                });
              }}
              className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              Nueva Devolución
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
