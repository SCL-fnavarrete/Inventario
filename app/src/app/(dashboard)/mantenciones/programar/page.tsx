"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  Wrench,
  Calendar,
  User,
  DollarSign,
  Building,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  AlertCircle,
  Loader2,
  CheckCircle,
  ChevronRight,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Asset = {
  id: string;
  numeroSerie: string | null;
  marca: string;
  modelo: string;
  estado: string;
  condicion: string;
  categoria: {
    nombre: string;
  };
  empleadoActual: {
    id: string;
    rut: string;
    nombres: string;
    apellidoPaterno: string;
  } | null;
};

type Employee = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correo: string;
  cargo: string | null;
  ubicacion: string | null;
  _count: {
    assignments: number;
    activosActuales: number;
  };
};

const tipoOptions = [
  { value: "preventiva", label: "Preventiva", description: "Mantención programada regular" },
  { value: "correctiva", label: "Correctiva", description: "Reparación de fallo o problema" },
  { value: "actualizacion_so", label: "Actualización SO", description: "Actualización de sistema operativo" },
  { value: "limpieza", label: "Limpieza", description: "Limpieza física y lógica" },
  { value: "reparacion", label: "Reparación", description: "Reparación de hardware o software" },
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

export default function ProgramarMantencionPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(1);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadingAsset, setLoadingAsset] = useState(false);

  // Employee selection states
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [employeeAssets, setEmployeeAssets] = useState<Asset[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingEmployeeAssets, setLoadingEmployeeAssets] = useState(false);

  const [formData, setFormData] = useState({
    tipo: "",
    descripcion: "",
    fechaProgramada: "",
    proximaMantencion: "",
    realizadoPor: "",
    costo: "",
    proveedorExterno: "",
  });

  // Load employees on mount
  useEffect(() => {
    fetchEmployees();
  }, []);

  // Load asset from URL parameter if present
  useEffect(() => {
    const activoId = searchParams.get("activoId");
    if (activoId) {
      loadAssetById(activoId);
    }
  }, [searchParams]);

  async function fetchEmployees() {
    setLoadingEmployees(true);
    setError("");
    try {
      const res = await fetch(
        "/api/empleados?estado=activo&limit=100&sortBy=nombres&sortOrder=asc"
      );
      if (!res.ok) throw new Error("Error al cargar empleados");
      const data = await res.json();
      setEmployees(data.data || []);
    } catch (err) {
      console.error("Error fetching employees:", err);
      setError("Error al cargar la lista de empleados");
    } finally {
      setLoadingEmployees(false);
    }
  }

  async function loadAssetById(id: string) {
    setLoadingAsset(true);
    setError("");
    try {
      const res = await fetch(`/api/activos/${id}`);
      if (!res.ok) throw new Error("Activo no encontrado");
      const asset = await res.json();
      setSelectedAsset(asset);
      setStep(2);
    } catch (err) {
      console.error("Error loading asset:", err);
      setError("Error al cargar el activo. Por favor, selecciónalo manualmente.");
    } finally {
      setLoadingAsset(false);
    }
  }

  async function handleSelectEmployee(emp: Employee) {
    setSelectedEmployee(emp);
    setEmployeeAssets([]);
    setLoadingEmployeeAssets(true);
    setError("");
    try {
      const res = await fetch(`/api/empleados/${emp.id}`);
      if (!res.ok) throw new Error("Error al cargar activos");
      const data = await res.json();
      setEmployeeAssets(data.activosActuales || []);
    } catch (err) {
      console.error("Error fetching employee assets:", err);
      setError("Error al cargar los activos del empleado");
    } finally {
      setLoadingEmployeeAssets(false);
    }
  }

  function handleBackToEmployees() {
    setSelectedEmployee(null);
    setEmployeeAssets([]);
    setError("");
  }

  function handleSelectAsset(asset: Asset) {
    setSelectedAsset(asset);
    setStep(2);
  }

  // Filter employees by search term (client-side)
  const filteredEmployees = employees.filter((emp) => {
    if (!employeeSearch.trim()) return true;
    const search = employeeSearch.toLowerCase();
    return (
      emp.nombres.toLowerCase().includes(search) ||
      emp.apellidoPaterno.toLowerCase().includes(search) ||
      (emp.apellidoMaterno?.toLowerCase().includes(search) ?? false) ||
      emp.rut.toLowerCase().includes(search) ||
      (emp.cargo?.toLowerCase().includes(search) ?? false)
    );
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedAsset || !formData.tipo || !formData.descripcion) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/mantenciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assetId: selectedAsset.id,
          tipo: formData.tipo,
          descripcion: formData.descripcion,
          fechaProgramada: formData.fechaProgramada || null,
          proximaMantencion: formData.proximaMantencion || null,
          realizadoPor: formData.realizadoPor || null,
          costo: formData.costo ? parseFloat(formData.costo) : null,
          proveedorExterno: formData.proveedorExterno || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al programar mantención");
        return;
      }

      router.push(`/mantenciones/${data.id}`);
    } catch (err) {
      console.error("Error creating maintenance:", err);
      setError("Error al programar mantención");
    } finally {
      setSubmitting(false);
    }
  }

  // Show loading spinner when loading asset from URL
  if (loadingAsset) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Cargando activo...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/mantenciones"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Programar Mantención</h1>
          <p className="text-gray-600">Programar una nueva mantención para un activo</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-4">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center">
            <div
              className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                step >= s
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
              )}
            >
              {step > s ? <CheckCircle size={16} /> : s}
            </div>
            {s < 3 && (
              <div
                className={cn(
                  "w-16 h-1 mx-2",
                  step > s ? "bg-blue-600" : "bg-gray-200"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Employee → then Asset */}
      {step === 1 && (
        <div className="bg-white rounded-lg shadow p-6">
          {!selectedEmployee ? (
            <>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                  1
                </span>
                Seleccionar Empleado
              </h2>

              {/* Search filter */}
              <div className="mb-4 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Filtrar por nombre, RUT o cargo..."
                  value={employeeSearch}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                />
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}

              {/* Employee list */}
              {loadingEmployees ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-3 text-gray-600">Cargando empleados...</span>
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-gray-700">
                    {employeeSearch
                      ? "No se encontraron empleados"
                      : "No hay empleados activos"}
                  </p>
                  {employeeSearch && (
                    <p className="text-sm mt-1">Intenta con otros términos de búsqueda</p>
                  )}
                </div>
              ) : (
                <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {filteredEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      onClick={() => handleSelectEmployee(emp)}
                      className="w-full flex items-center gap-3 p-4 hover:bg-blue-50 transition-colors text-left"
                    >
                      <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-gray-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {emp.nombres} {emp.apellidoPaterno}
                          {emp.apellidoMaterno ? ` ${emp.apellidoMaterno}` : ""}
                        </p>
                        <p className="text-sm text-gray-500 truncate">
                          {emp.cargo || "Sin cargo"} &bull; {emp.rut}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {emp._count.activosActuales > 0 && (
                          <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700">
                            {emp._count.activosActuales}{" "}
                            activo{emp._count.activosActuales !== 1 ? "s" : ""}
                          </span>
                        )}
                        <ChevronRight className="h-5 w-5 text-gray-400" />
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* Count info */}
              {!loadingEmployees && filteredEmployees.length > 0 && (
                <div className="mt-4 text-sm text-gray-500 text-center">
                  Mostrando {filteredEmployees.length} empleado
                  {filteredEmployees.length !== 1 ? "s" : ""}
                  {employeeSearch ? ` de ${employees.length}` : ""}
                </div>
              )}

              {/* Help text */}
              <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                <div className="flex gap-3">
                  <Users className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-blue-900">
                      Selecciona un empleado
                    </p>
                    <p className="text-sm text-blue-700 mt-1">
                      Elige al empleado para ver sus activos asignados y programar una mantención.
                    </p>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
                  1
                </span>
                Seleccionar Activo
              </h2>

              {/* Selected employee info */}
              <div className="mb-4 p-4 bg-gray-50 rounded-lg flex items-center gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">
                    {selectedEmployee.nombres} {selectedEmployee.apellidoPaterno}
                  </p>
                  <p className="text-sm text-gray-500">
                    {selectedEmployee.cargo || "Sin cargo"} &bull;{" "}
                    {selectedEmployee.rut}
                  </p>
                </div>
                <button
                  onClick={handleBackToEmployees}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap"
                >
                  Cambiar empleado
                </button>
              </div>

              {error && (
                <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                  <AlertCircle size={20} />
                  {error}
                </div>
              )}

              {/* Employee's assets */}
              {loadingEmployeeAssets ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                  <span className="ml-3 text-gray-600">Cargando activos...</span>
                </div>
              ) : employeeAssets.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium text-gray-700">
                    Este empleado no tiene activos asignados
                  </p>
                  <p className="text-sm mt-1">
                    Selecciona otro empleado para ver sus activos
                  </p>
                  <button
                    onClick={handleBackToEmployees}
                    className="mt-4 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Volver a empleados
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-gray-600 mb-3">
                    Selecciona el activo para programar la mantención:
                  </p>
                  {employeeAssets.map((asset) => (
                    <button
                      key={asset.id}
                      onClick={() => handleSelectAsset(asset)}
                      className="w-full flex items-center gap-3 p-4 rounded-lg border-2 border-gray-200 hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                    >
                      <span className="flex-shrink-0 text-gray-400">
                        {getCategoryIcon(asset.categoria.nombre)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 truncate">
                          {asset.marca} {asset.modelo}
                        </p>
                        <p className="text-sm text-gray-600 truncate">
                          <span className="font-medium">{asset.categoria.nombre}</span>
                          {" \u2022 "}
                          <span>
                            {asset.numeroSerie || "Sin número de serie"}
                          </span>
                        </p>
                      </div>
                      <div className="flex-shrink-0">
                        <span
                          className={cn(
                            "px-2.5 py-1 text-xs font-medium rounded-full whitespace-nowrap",
                            asset.estado === "disponible" &&
                              "bg-green-100 text-green-700",
                            asset.estado === "asignado" &&
                              "bg-blue-100 text-blue-700",
                            asset.estado === "en_mantencion" &&
                              "bg-orange-100 text-orange-700"
                          )}
                        >
                          {asset.estado}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Step 2: Tipo de Mantención */}
      {step === 2 && selectedAsset && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
              2
            </span>
            Tipo de Mantención
          </h2>

          {/* Selected Asset Info */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-gray-400">
                {getCategoryIcon(selectedAsset.categoria.nombre)}
              </span>
              <div>
                <p className="font-medium">
                  {selectedAsset.marca} {selectedAsset.modelo}
                </p>
                <p className="text-sm text-gray-500">
                  {selectedAsset.numeroSerie || "Sin serie"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tipoOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setFormData((prev) => ({ ...prev, tipo: option.value }));
                  setStep(3);
                }}
                className={cn(
                  "p-4 rounded-lg border text-left transition-colors",
                  formData.tipo === option.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
                )}
              >
                <p className="font-medium">{option.label}</p>
                <p className="text-sm text-gray-500 mt-1">{option.description}</p>
              </button>
            ))}
          </div>

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Volver
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Detalles de la Mantención */}
      {step === 3 && selectedAsset && formData.tipo && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-sm font-bold">
              3
            </span>
            Detalles de la Mantención
          </h2>

          {/* Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Activo</p>
              <p className="font-medium">
                {selectedAsset.marca} {selectedAsset.modelo}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Tipo de Mantención</p>
              <p className="font-medium">
                {tipoOptions.find((t) => t.value === formData.tipo)?.label}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Descripción *
              </label>
              <textarea
                required
                rows={3}
                placeholder="Describe la mantención a realizar..."
                value={formData.descripcion}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, descripcion: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Fecha Programada
              </label>
              <input
                type="date"
                value={formData.fechaProgramada}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, fechaProgramada: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Próxima Mantención
              </label>
              <input
                type="date"
                value={formData.proximaMantencion}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, proximaMantencion: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="inline h-4 w-4 mr-1" />
                Técnico Asignado
              </label>
              <input
                type="text"
                placeholder="Nombre del técnico"
                value={formData.realizadoPor}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, realizadoPor: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <DollarSign className="inline h-4 w-4 mr-1" />
                Costo Estimado (CLP)
              </label>
              <input
                type="number"
                placeholder="0"
                min="0"
                value={formData.costo}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, costo: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Building className="inline h-4 w-4 mr-1" />
                Proveedor Externo (si aplica)
              </label>
              <input
                type="text"
                placeholder="Nombre del proveedor"
                value={formData.proveedorExterno}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, proveedorExterno: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={submitting || !formData.descripcion}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <Wrench size={20} />
              )}
              Programar Mantención
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
