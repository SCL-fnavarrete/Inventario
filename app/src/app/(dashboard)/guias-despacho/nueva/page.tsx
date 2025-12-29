"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Package,
  MapPin,
  FileText,
  CheckCircle,
  User,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SelectorActivos } from "@/components/guias-despacho/SelectorActivos";
import { GuiaDespachoPreview } from "@/components/guias-despacho/GuiaDespachoPreview";
import { TipoDespacho } from "@prisma/client";

type Employee = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correo: string;
  cargo: string | null;
  ubicacion: string | null;
};

type Asset = {
  id: string;
  numeroSerie: string | null;
  imei: string | null;
  marca: string;
  modelo: string;
  procesador: string | null;
  ram: string | null;
  discoDuro: string | null;
  sistemaOperativo: string | null;
  numeroTelefono: string | null;
  tipoPlan: string | null;
  estado: string;
  condicion: string;
  categoria: {
    id: string;
    nombre: string;
  };
};

const STEPS = [
  { id: 1, title: "Seleccionar Equipos", icon: Package },
  { id: 2, title: "Datos del Despacho", icon: MapPin },
  { id: 3, title: "Destinatario", icon: User },
  { id: 4, title: "Confirmar", icon: CheckCircle },
];

const TIPO_DESPACHO_OPTIONS = [
  { value: "asignacion", label: "Asignación", description: "Entrega permanente de equipo" },
  { value: "traslado", label: "Traslado", description: "Movimiento entre ubicaciones" },
  { value: "prestamo", label: "Préstamo", description: "Entrega temporal" },
];

export default function NuevaGuiaDespachoPage() {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Assets
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  // Step 2: Dispatch data
  const [dispatchData, setDispatchData] = useState({
    origen: "",
    destino: "",
    tipoDespacho: "asignacion" as TipoDespacho,
    despachadoPor: "",
    fechaDespacho: new Date().toISOString().slice(0, 16),
    observaciones: "",
  });

  // Step 3: Recipient
  const [useEmployee, setUseEmployee] = useState(true);
  const [rutSearch, setRutSearch] = useState("");
  const [searchingEmployee, setSearchingEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [employeeSuggestions, setEmployeeSuggestions] = useState<Employee[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [manualRecipient, setManualRecipient] = useState({
    nombre: "",
    rut: "",
  });

  // Step 4: Result
  const [result, setResult] = useState<{ success: boolean; guideId?: string; numero?: string } | null>(null);

  // Búsqueda con autocompletado
  async function handleSearchChange(value: string) {
    setRutSearch(value);
    setEmployeeError(null);

    // Limpiar empleado seleccionado si el usuario empieza a escribir de nuevo
    if (selectedEmployee && value !== selectedEmployee.rut) {
      setSelectedEmployee(null);
    }

    // Búsqueda automática cuando hay al menos 4 caracteres
    if (value.trim().length >= 4) {
      setSearchingEmployee(true);
      setShowSuggestions(true);

      try {
        // Pasar el término de búsqueda a la API
        const res = await fetch(`/api/empleados?search=${encodeURIComponent(value.trim())}&limit=10`);
        const response = await res.json();
        const employees = response.data || [];

        setEmployeeSuggestions(employees);
      } catch (error) {
        console.error("Error searching employees:", error);
        setEmployeeSuggestions([]);
      } finally {
        setSearchingEmployee(false);
      }
    } else {
      setShowSuggestions(false);
      setEmployeeSuggestions([]);
    }
  }

  function selectEmployee(employee: Employee) {
    setSelectedEmployee(employee);
    setRutSearch(employee.rut);
    setShowSuggestions(false);
    setEmployeeSuggestions([]);
    setEmployeeError(null);
  }

  // Cerrar sugerencias al hacer click fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);

    try {
      const body = {
        origen: dispatchData.origen,
        destino: dispatchData.destino,
        tipoDespacho: dispatchData.tipoDespacho,
        despachadoPor: dispatchData.despachadoPor,
        fechaDespacho: dispatchData.fechaDespacho,
        observaciones: dispatchData.observaciones || null,
        assetIds: selectedAssets.map((a) => a.id),
        destinatarioId: useEmployee ? selectedEmployee?.id : null,
        destinatarioNombre: useEmployee
          ? null
          : manualRecipient.nombre || null,
        destinatarioRut: useEmployee ? null : manualRecipient.rut || null,
      };

      const res = await fetch("/api/guias-despacho", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al crear guía de despacho");
      }

      setResult({
        success: true,
        guideId: data.id,
        numero: data.numero,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setResult({ success: false });
    } finally {
      setSubmitting(false);
    }
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 1:
        return selectedAssets.length > 0;
      case 2:
        return !!(
          dispatchData.origen &&
          dispatchData.destino &&
          dispatchData.despachadoPor &&
          dispatchData.fechaDespacho
        );
      case 3:
        if (useEmployee) {
          return !!selectedEmployee;
        }
        return true; // Manual recipient is optional
      default:
        return true;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/guias-despacho"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Guía de Despacho</h1>
          <p className="text-gray-600">Crear guía para despacho de equipos</p>
        </div>
      </div>

      {/* Steps Indicator */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;

            return (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                      isActive
                        ? "bg-blue-600 text-white"
                        : isCompleted
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    )}
                  >
                    {isCompleted ? <Check size={20} /> : <Icon size={20} />}
                  </div>
                  <span
                    className={cn(
                      "text-xs mt-2 text-center hidden sm:block",
                      isActive ? "text-blue-600 font-medium" : "text-gray-500"
                    )}
                  >
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-12 sm:w-24 h-1 mx-2",
                      isCompleted ? "bg-green-600" : "bg-gray-200"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow p-6">
        {error && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Seleccionar Equipos */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Seleccionar equipos a despachar</h2>
            <SelectorActivos
              selectedAssets={selectedAssets}
              onSelectionChange={setSelectedAssets}
            />
          </div>
        )}

        {/* Step 2: Datos del Despacho */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Datos del despacho</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Origen <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Bodega Central, Oficina Santiago"
                  value={dispatchData.origen}
                  onChange={(e) =>
                    setDispatchData((prev) => ({ ...prev, origen: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destino <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Ej: Sucursal Rancagua, Cliente ABC"
                  value={dispatchData.destino}
                  onChange={(e) =>
                    setDispatchData((prev) => ({ ...prev, destino: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Despacho <span className="text-red-500">*</span>
                </label>
                <select
                  value={dispatchData.tipoDespacho}
                  onChange={(e) =>
                    setDispatchData((prev) => ({
                      ...prev,
                      tipoDespacho: e.target.value as TipoDespacho,
                    }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {TIPO_DESPACHO_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} - {option.description}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Despachado por <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Nombre del responsable"
                  value={dispatchData.despachadoPor}
                  onChange={(e) =>
                    setDispatchData((prev) => ({ ...prev, despachadoPor: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha y Hora <span className="text-red-500">*</span>
                </label>
                <input
                  type="datetime-local"
                  value={dispatchData.fechaDespacho}
                  onChange={(e) =>
                    setDispatchData((prev) => ({ ...prev, fechaDespacho: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Observaciones
                </label>
                <textarea
                  value={dispatchData.observaciones}
                  onChange={(e) =>
                    setDispatchData((prev) => ({ ...prev, observaciones: e.target.value }))
                  }
                  rows={3}
                  placeholder="Notas adicionales sobre el despacho..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Destinatario */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Datos del destinatario (opcional)</h2>

            <div className="flex gap-4 mb-4">
              <button
                onClick={() => setUseEmployee(true)}
                className={cn(
                  "flex-1 p-4 border rounded-lg transition-colors",
                  useEmployee
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300"
                )}
              >
                <User className={cn("mx-auto mb-2", useEmployee ? "text-blue-600" : "text-gray-400")} size={24} />
                <p className="font-medium">Empleado del sistema</p>
                <p className="text-sm text-gray-500">Buscar por RUT</p>
              </button>
              <button
                onClick={() => setUseEmployee(false)}
                className={cn(
                  "flex-1 p-4 border rounded-lg transition-colors",
                  !useEmployee
                    ? "border-blue-600 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300"
                )}
              >
                <FileText className={cn("mx-auto mb-2", !useEmployee ? "text-blue-600" : "text-gray-400")} size={24} />
                <p className="font-medium">Ingresar manualmente</p>
                <p className="text-sm text-gray-500">O dejar vacío</p>
              </button>
            </div>

            {useEmployee ? (
              <div className="space-y-4">
                <div className="relative" ref={searchRef}>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input
                      type="text"
                      placeholder="Buscar por RUT o nombre (mín. 4 caracteres)..."
                      value={rutSearch}
                      onChange={(e) => handleSearchChange(e.target.value)}
                      onFocus={() => {
                        if (employeeSuggestions.length > 0) {
                          setShowSuggestions(true);
                        }
                      }}
                      className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    {searchingEmployee && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <Loader2 className="animate-spin text-blue-600" size={20} />
                      </div>
                    )}
                  </div>

                  {/* Lista de sugerencias */}
                  {showSuggestions && employeeSuggestions.length > 0 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {employeeSuggestions.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => selectEmployee(emp)}
                          className="w-full p-3 hover:bg-blue-50 transition-colors text-left border-b border-gray-100 last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                              <User className="text-blue-600" size={20} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-gray-900 truncate">
                                {emp.nombres} {emp.apellidoPaterno} {emp.apellidoMaterno}
                              </p>
                              <p className="text-sm text-gray-600 truncate">
                                RUT: {emp.rut}
                              </p>
                              {emp.cargo && (
                                <p className="text-xs text-gray-500 truncate">
                                  {emp.cargo} {emp.ubicacion && `| ${emp.ubicacion}`}
                                </p>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Mensaje cuando no hay resultados */}
                  {showSuggestions && !searchingEmployee && employeeSuggestions.length === 0 && rutSearch.trim().length >= 4 && (
                    <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-lg shadow-lg p-4">
                      <p className="text-gray-500 text-sm text-center">
                        No se encontraron empleados con ese criterio
                      </p>
                    </div>
                  )}
                </div>

                {employeeError && (
                  <p className="text-red-600 text-sm">{employeeError}</p>
                )}

                {/* Empleado seleccionado */}
                {selectedEmployee && (
                  <div className="p-4 bg-gradient-to-r from-blue-50 to-blue-100 border-2 border-blue-300 rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-14 h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-md">
                        <User className="text-white" size={28} />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-gray-900 text-lg">
                          {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}{" "}
                          {selectedEmployee.apellidoMaterno}
                        </p>
                        <div className="mt-1 space-y-0.5">
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">RUT:</span> {selectedEmployee.rut}
                          </p>
                          <p className="text-sm text-gray-700">
                            <span className="font-medium">Email:</span> {selectedEmployee.correo}
                          </p>
                          {selectedEmployee.cargo && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Cargo:</span> {selectedEmployee.cargo}
                            </p>
                          )}
                          {selectedEmployee.ubicacion && (
                            <p className="text-sm text-gray-700">
                              <span className="font-medium">Ubicación:</span> {selectedEmployee.ubicacion}
                            </p>
                          )}
                        </div>
                      </div>
                      <CheckCircle className="flex-shrink-0 text-green-600" size={32} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del destinatario
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={manualRecipient.nombre}
                    onChange={(e) =>
                      setManualRecipient((prev) => ({ ...prev, nombre: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    RUT
                  </label>
                  <input
                    type="text"
                    placeholder="XX.XXX.XXX-X"
                    value={manualRecipient.rut}
                    onChange={(e) =>
                      setManualRecipient((prev) => ({ ...prev, rut: e.target.value }))
                    }
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Confirmar */}
        {currentStep === 4 && (
          <div className="space-y-6">
            {result?.success ? (
              <div className="p-6 bg-green-50 rounded-lg text-center">
                <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
                <h2 className="text-xl font-semibold text-green-800 mb-2">
                  Guía Creada Exitosamente
                </h2>
                <p className="text-green-700 mb-2">
                  Número de guía: <strong>{result.numero}</strong>
                </p>
                <div className="mt-6 flex justify-center gap-4">
                  <Link
                    href="/guias-despacho"
                    className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                  >
                    Ver Listado
                  </Link>
                  <Link
                    href={`/guias-despacho/${result.guideId}`}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Ver Detalle
                  </Link>
                  <button
                    onClick={async () => {
                      const response = await fetch(`/api/guias-despacho/${result.guideId}/pdf`);
                      const blob = await response.blob();
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `guia_despacho_${result.numero}.pdf`;
                      a.click();
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  >
                    Descargar PDF
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Previsualización de Guía de Despacho</h2>
                  <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                    Vista previa del documento
                  </span>
                </div>

                {/* Previsualización del PDF */}
                <div className="overflow-auto max-h-[600px] border border-gray-200 rounded-lg shadow-inner bg-gray-100 p-4">
                  <GuiaDespachoPreview
                    assets={selectedAssets}
                    dispatchData={dispatchData}
                    useEmployee={useEmployee}
                    selectedEmployee={selectedEmployee}
                    manualRecipient={manualRecipient}
                    copyType="original"
                  />
                </div>

                <p className="text-sm text-gray-500 text-center mt-2">
                  El PDF final incluirá dos páginas: Original y Copia para el destinatario
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {!result?.success && (
        <div className="flex justify-between">
          <button
            onClick={() => setCurrentStep((prev) => prev - 1)}
            disabled={currentStep === 1}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            <ArrowLeft size={20} />
            Anterior
          </button>

          {currentStep < 4 ? (
            <button
              onClick={() => setCurrentStep((prev) => prev + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Siguiente
              <ArrowRight size={20} />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Creando...
                </>
              ) : (
                <>
                  <Check size={20} />
                  Crear Guía de Despacho
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
