"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Search,
  Check,
  Loader2,
  User,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  FileText,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Employee = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correo: string;
  cargo: string | null;
  ubicacion: string | null;
  estado: string;
};

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  estado: string;
  condicion: string;
  categoria: {
    id: string;
    nombre: string;
  };
};

const STEPS = [
  { id: 1, title: "Seleccionar Empleado", icon: User },
  { id: 2, title: "Seleccionar Equipos", icon: Laptop },
  { id: 3, title: "Datos de Entrega", icon: FileText },
  { id: 4, title: "Confirmar", icon: CheckCircle },
];

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

export default function NuevaAsignacionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Step 1: Employee
  const [rutSearch, setRutSearch] = useState("");
  const [searchingEmployee, setSearchingEmployee] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);

  // Step 2: Assets
  const [availableAssets, setAvailableAssets] = useState<Asset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Asset[]>([]);

  // Step 3: Delivery data
  const [deliveryData, setDeliveryData] = useState({
    fechaEntrega: new Date().toISOString().split("T")[0],
    lugarEntrega: "",
    entregadoPor: "",
    tipoMovimiento: "ingreso" as "ingreso" | "cambio" | "reemplazo" | "temporal",
    motivo: "",
  });

  // Step 4: Result
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  // Check for pre-selected asset from URL
  useEffect(() => {
    const preSelectedAssetId = searchParams.get("activoId");
    if (preSelectedAssetId) {
      fetchPreSelectedAsset(preSelectedAssetId);
    }
  }, [searchParams]);

  useEffect(() => {
    if (currentStep === 2) {
      fetchAvailableAssets();
    }
  }, [currentStep]);

  async function fetchPreSelectedAsset(assetId: string) {
    try {
      const res = await fetch(`/api/activos/${assetId}`);
      if (!res.ok) {
        console.error("Error fetching pre-selected asset");
        return;
      }
      const asset = await res.json();

      // Only pre-select if the asset is available for assignment
      if (asset.estado === "disponible" || asset.estado === "reutilizable") {
        setSelectedAssets([{
          id: asset.id,
          numeroSerie: asset.numeroSerie,
          marca: asset.marca,
          modelo: asset.modelo,
          estado: asset.estado,
          condicion: asset.condicion,
          categoria: asset.categoria,
        }]);
      }
    } catch (err) {
      console.error("Error loading pre-selected asset:", err);
    }
  }

  async function searchEmployee() {
    if (!rutSearch.trim()) {
      setEmployeeError("Ingrese un RUT para buscar");
      return;
    }

    setSearchingEmployee(true);
    setEmployeeError(null);

    try {
      const res = await fetch(`/api/empleados/buscar?rut=${encodeURIComponent(rutSearch)}`);
      const data = await res.json();

      if (!res.ok) {
        setEmployeeError(data.error || "Empleado no encontrado");
        setSelectedEmployee(null);
        return;
      }

      if (data.estado !== "activo") {
        setEmployeeError("El empleado no está activo");
        setSelectedEmployee(null);
        return;
      }

      setSelectedEmployee(data);
    } catch (err) {
      setEmployeeError("Error al buscar empleado");
    } finally {
      setSearchingEmployee(false);
    }
  }

  async function fetchAvailableAssets() {
    setLoading(true);
    try {
      const res = await fetch("/api/activos?estado=disponible&limit=100");
      const data = await res.json();

      // También incluir activos reutilizables
      const res2 = await fetch("/api/activos?estado=reutilizable&limit=100");
      const data2 = await res2.json();

      setAvailableAssets([...(data.data || []), ...(data2.data || [])]);
    } catch (err) {
      console.error("Error fetching assets:", err);
    } finally {
      setLoading(false);
    }
  }

  function toggleAsset(asset: Asset) {
    setSelectedAssets((prev) => {
      const isSelected = prev.some((a) => a.id === asset.id);
      if (isSelected) {
        return prev.filter((a) => a.id !== asset.id);
      } else {
        return [...prev, asset];
      }
    });
  }

  async function handleSubmit() {
    if (!selectedEmployee || selectedAssets.length === 0) {
      setError("Datos incompletos");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/asignaciones/multiple", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: selectedEmployee.id,
          assetIds: selectedAssets.map((a) => a.id),
          fechaEntrega: deliveryData.fechaEntrega,
          lugarEntrega: deliveryData.lugarEntrega || null,
          entregadoPor: deliveryData.entregadoPor || null,
          tipoMovimiento: deliveryData.tipoMovimiento,
          motivo: deliveryData.motivo || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Error al crear asignaciones");
      }

      setResult({ success: true, message: data.message });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
      setResult({ success: false, message: err instanceof Error ? err.message : "Error" });
    } finally {
      setSubmitting(false);
    }
  }

  function canProceed(): boolean {
    switch (currentStep) {
      case 1:
        return !!selectedEmployee;
      case 2:
        return selectedAssets.length > 0;
      case 3:
        return !!deliveryData.fechaEntrega;
      default:
        return true;
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/asignaciones"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={24} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Asignación</h1>
          <p className="text-gray-600">Asignar equipos a un colaborador</p>
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
                      "text-xs mt-2 text-center",
                      isActive ? "text-blue-600 font-medium" : "text-gray-500"
                    )}
                  >
                    {step.title}
                  </span>
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={cn(
                      "w-24 h-1 mx-2",
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

        {/* Step 1: Seleccionar Empleado */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Buscar empleado por RUT</h2>

            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="Ingrese RUT (ej: 21.523.308-1)"
                  value={rutSearch}
                  onChange={(e) => setRutSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && searchEmployee()}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={searchEmployee}
                disabled={searchingEmployee}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {searchingEmployee ? (
                  <Loader2 className="animate-spin" size={20} />
                ) : (
                  <Search size={20} />
                )}
              </button>
            </div>

            {employeeError && (
              <p className="text-red-600 text-sm">{employeeError}</p>
            )}

            {selectedEmployee && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center">
                    <User className="text-white" size={24} />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}{" "}
                      {selectedEmployee.apellidoMaterno}
                    </p>
                    <p className="text-sm text-gray-600">
                      {selectedEmployee.rut} | {selectedEmployee.correo}
                    </p>
                    <p className="text-sm text-gray-500">
                      {selectedEmployee.cargo} | {selectedEmployee.ubicacion}
                    </p>
                  </div>
                  <CheckCircle className="ml-auto text-green-600" size={24} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Seleccionar Equipos */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Seleccionar equipos disponibles</h2>
              <span className="text-sm text-gray-500">
                {selectedAssets.length} seleccionados
              </span>
            </div>

            {searchParams.get("activoId") && selectedAssets.length > 0 && (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  <CheckCircle className="inline mr-2 h-4 w-4" />
                  El equipo ha sido pre-seleccionado. Puedes agregar más equipos si es necesario.
                </p>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="animate-spin mr-2" />
                <span>Cargando equipos...</span>
              </div>
            ) : availableAssets.length === 0 ? (
              <p className="text-center py-12 text-gray-500">
                No hay equipos disponibles para asignar
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
                {availableAssets.map((asset) => {
                  const isSelected = selectedAssets.some((a) => a.id === asset.id);
                  return (
                    <div
                      key={asset.id}
                      onClick={() => toggleAsset(asset)}
                      className={cn(
                        "p-4 border rounded-lg cursor-pointer transition-colors",
                        isSelected
                          ? "border-blue-600 bg-blue-50"
                          : "border-gray-200 hover:border-blue-300"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "p-2 rounded-lg",
                            isSelected ? "bg-blue-600 text-white" : "bg-gray-100"
                          )}
                        >
                          {getCategoryIcon(asset.categoria.nombre)}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium">
                            {asset.marca} {asset.modelo}
                          </p>
                          <p className="text-sm text-gray-500">
                            {asset.categoria.nombre} | {asset.numeroSerie || "Sin serie"}
                          </p>
                        </div>
                        {isSelected && (
                          <CheckCircle className="text-blue-600" size={20} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedAssets.length > 0 && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium mb-2">Equipos seleccionados:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedAssets.map((asset) => (
                    <span
                      key={asset.id}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                    >
                      {asset.categoria.nombre}: {asset.marca} {asset.modelo}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Datos de Entrega */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">Datos de la entrega</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Fecha de Entrega <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={deliveryData.fechaEntrega}
                  onChange={(e) =>
                    setDeliveryData((prev) => ({ ...prev, fechaEntrega: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lugar de Entrega
                </label>
                <input
                  type="text"
                  placeholder="Santiago, Rancagua..."
                  value={deliveryData.lugarEntrega}
                  onChange={(e) =>
                    setDeliveryData((prev) => ({ ...prev, lugarEntrega: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Entregado por
                </label>
                <input
                  type="text"
                  placeholder="Nombre del técnico IT"
                  value={deliveryData.entregadoPor}
                  onChange={(e) =>
                    setDeliveryData((prev) => ({ ...prev, entregadoPor: e.target.value }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tipo de Movimiento
                </label>
                <select
                  value={deliveryData.tipoMovimiento}
                  onChange={(e) =>
                    setDeliveryData((prev) => ({
                      ...prev,
                      tipoMovimiento: e.target.value as typeof deliveryData.tipoMovimiento,
                    }))
                  }
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                >
                  <option value="ingreso">Ingreso (nuevo colaborador)</option>
                  <option value="cambio">Cambio de equipo</option>
                  <option value="reemplazo">Reemplazo por falla</option>
                  <option value="temporal">Préstamo temporal</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Motivo / Observaciones
                </label>
                <textarea
                  value={deliveryData.motivo}
                  onChange={(e) =>
                    setDeliveryData((prev) => ({ ...prev, motivo: e.target.value }))
                  }
                  rows={3}
                  placeholder="Descripción adicional..."
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Confirmar */}
        {currentStep === 4 && (
          <div className="space-y-6">
            {result ? (
              <div
                className={cn(
                  "p-6 rounded-lg text-center",
                  result.success ? "bg-green-50" : "bg-red-50"
                )}
              >
                {result.success ? (
                  <>
                    <CheckCircle className="mx-auto text-green-600 mb-4" size={48} />
                    <h2 className="text-xl font-semibold text-green-800 mb-2">
                      Asignación Exitosa
                    </h2>
                    <p className="text-green-700">{result.message}</p>
                    <div className="mt-6 flex justify-center gap-4">
                      <Link
                        href="/asignaciones"
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
                      >
                        Ver Asignaciones
                      </Link>
                      <button
                        onClick={() => {
                          setCurrentStep(1);
                          setSelectedEmployee(null);
                          setSelectedAssets([]);
                          setResult(null);
                          setRutSearch("");
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      >
                        Nueva Asignación
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-semibold text-red-800 mb-2">
                      Error en la Asignación
                    </h2>
                    <p className="text-red-700">{result.message}</p>
                    <button
                      onClick={() => setResult(null)}
                      className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                    >
                      Intentar de nuevo
                    </button>
                  </>
                )}
              </div>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Confirmar Asignación</h2>

                <div className="space-y-4">
                  {/* Resumen Empleado */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-700 mb-2">Empleado</h3>
                    {selectedEmployee && (
                      <p>
                        {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno} (
                        {selectedEmployee.rut})
                      </p>
                    )}
                  </div>

                  {/* Resumen Equipos */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-700 mb-2">
                      Equipos ({selectedAssets.length})
                    </h3>
                    <ul className="space-y-1">
                      {selectedAssets.map((asset) => (
                        <li key={asset.id} className="text-sm">
                          {asset.categoria.nombre}: {asset.marca} {asset.modelo} (
                          {asset.numeroSerie || "Sin serie"})
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Resumen Entrega */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium text-gray-700 mb-2">Datos de Entrega</h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <p>
                        <span className="text-gray-500">Fecha:</span>{" "}
                        {deliveryData.fechaEntrega}
                      </p>
                      <p>
                        <span className="text-gray-500">Lugar:</span>{" "}
                        {deliveryData.lugarEntrega || "-"}
                      </p>
                      <p>
                        <span className="text-gray-500">Entregado por:</span>{" "}
                        {deliveryData.entregadoPor || "-"}
                      </p>
                      <p>
                        <span className="text-gray-500">Tipo:</span>{" "}
                        {deliveryData.tipoMovimiento}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Navigation */}
      {!result && (
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
                  Procesando...
                </>
              ) : (
                <>
                  <Check size={20} />
                  Confirmar Asignación
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
