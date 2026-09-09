"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Search,
  UserMinus,
  Calendar,
  MapPin,
  User,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronRight,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  fechaEntrega: string;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    categoria: {
      nombre: string;
    };
  };
};

type EmployeeListItem = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correoPersonal: string;
  cargo: string | null;
  ubicacion: string | null;
  _count: {
    assignments: number;
    activosActuales: number;
  };
};

type Employee = {
  id: string;
  rut: string;
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string | null;
  correoPersonal: string;
  cargo: string | null;
  jefatura: string | null;
  ubicacion: string | null;
  tipoContrato: string;
  fechaIngreso: string | null;
  estado: string;
  assignments: Assignment[];
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

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("es-CL");
}

export default function NuevaDesvinculacionPage() {
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Employee list states
  const [employees, setEmployees] = useState<EmployeeListItem[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [loadingEmployees, setLoadingEmployees] = useState(true);
  const [loadingEmployee, setLoadingEmployee] = useState(false);

  const [formData, setFormData] = useState({
    fechaDesvinculacion: new Date().toISOString().split("T")[0],
    recibidoPor: "",
    lugarDevolucion: "",
    observaciones: "",
  });

  // Load active employees on mount
  useEffect(() => {
    fetchEmployees();
  }, []);

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

  async function handleSelectEmployee(emp: EmployeeListItem) {
    setLoadingEmployee(true);
    setError("");
    try {
      const res = await fetch(`/api/empleados/${emp.id}`);
      if (!res.ok) throw new Error("Error al cargar datos del empleado");
      const data = await res.json();

      // Filter only active assignments
      const activeAssignments =
        data.assignments?.filter(
          (a: Assignment & { activo: boolean }) => a.activo
        ) || [];

      setEmployee({
        ...data,
        assignments: activeAssignments,
      });
    } catch (err) {
      console.error("Error fetching employee:", err);
      setError("Error al cargar los datos del empleado");
    } finally {
      setLoadingEmployee(false);
    }
  }

  function handleBackToList() {
    setEmployee(null);
    setError("");
  }

  // Filter employees by search term (client-side)
  const filteredEmployees = employees.filter((emp) => {
    if (!employeeSearch.trim()) return true;
    const search = employeeSearch.toLowerCase();
    return (
      emp.nombres.toLowerCase().includes(search) ||
      emp.apellidoPaterno.toLowerCase().includes(search) ||
      (emp.apellidoMaterno?.toLowerCase().includes(search) ?? false) ||
      (emp.rut?.toLowerCase().includes(search) ?? false) ||
      (emp.cargo?.toLowerCase().includes(search) ?? false)
    );
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!employee) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/desvinculaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: employee.id,
          fechaDesvinculacion: formData.fechaDesvinculacion,
          recibidoPor: formData.recibidoPor || null,
          lugarDevolucion: formData.lugarDevolucion || null,
          observaciones: formData.observaciones || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al crear desvinculación");
        return;
      }

      router.push(`/desvinculaciones/${data.id}`);
    } catch (err) {
      console.error("Error creating termination:", err);
      setError("Error al crear desvinculación");
    } finally {
      setSubmitting(false);
    }
  }

  const activeAssignments = employee?.assignments || [];
  const hasNotebook = activeAssignments.some(
    (a) => a.asset.categoria.nombre.toLowerCase() === "notebook"
  );
  const hasCelular = activeAssignments.some(
    (a) => a.asset.categoria.nombre.toLowerCase() === "celular"
  );
  const hasMonitor = activeAssignments.some(
    (a) => a.asset.categoria.nombre.toLowerCase() === "monitor"
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/desvinculaciones"
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nueva Desvinculación</h1>
          <p className="text-gray-600">Registrar desvinculación de colaborador</p>
        </div>
      </div>

      {/* Step 1: Seleccionar empleado */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
            1
          </span>
          {employee ? "Empleado Seleccionado" : "Seleccionar Empleado"}
        </h2>

        {loadingEmployee ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-red-600" />
            <span className="ml-3 text-gray-600">Cargando datos del empleado...</span>
          </div>
        ) : !employee ? (
          <>
            {/* Search filter */}
            <div className="mb-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Filtrar por nombre, RUT o cargo..."
                value={employeeSearch}
                onChange={(e) => setEmployeeSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500 transition-all"
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
                <Loader2 className="h-8 w-8 animate-spin text-red-600" />
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
                    className="w-full flex items-center gap-3 p-4 hover:bg-red-50 transition-colors text-left"
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
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-orange-100 text-orange-700">
                          {emp._count.activosActuales}{" "}
                          equipo{emp._count.activosActuales !== 1 ? "s" : ""}
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
                {filteredEmployees.length !== 1 ? "s" : ""} activo
                {filteredEmployees.length !== 1 ? "s" : ""}
                {employeeSearch ? ` de ${employees.length}` : ""}
              </div>
            )}
          </>
        ) : (
          /* Selected employee summary with change button */
          <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <User className="h-6 w-6 text-red-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-gray-900">
                {employee.nombres} {employee.apellidoPaterno} {employee.apellidoMaterno}
              </p>
              <p className="text-sm text-gray-500 font-mono">{employee.rut}</p>
            </div>
            <button
              onClick={handleBackToList}
              className="text-sm text-red-600 hover:text-red-800 font-medium whitespace-nowrap"
            >
              Cambiar empleado
            </button>
          </div>
        )}
      </div>

      {/* Step 2: Datos del empleado */}
      {employee && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
              2
            </span>
            Datos del Empleado
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Info del empleado */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Correo</p>
                  <p className="font-medium">{employee.correoPersonal}</p>
                </div>
                <div>
                  <p className="text-gray-500">Cargo</p>
                  <p className="font-medium">{employee.cargo || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Jefatura</p>
                  <p className="font-medium">{employee.jefatura || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Ubicación</p>
                  <p className="font-medium">{employee.ubicacion || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Tipo Contrato</p>
                  <p className="font-medium capitalize">{employee.tipoContrato}</p>
                </div>
                <div>
                  <p className="text-gray-500">Fecha Ingreso</p>
                  <p className="font-medium">{formatDate(employee.fechaIngreso)}</p>
                </div>
              </div>
            </div>

            {/* Equipos asignados */}
            <div>
              <h3 className="font-medium text-gray-700 mb-3">Equipos Asignados Actualmente</h3>
              {activeAssignments.length > 0 ? (
                <div className="space-y-2">
                  {activeAssignments.map((assignment) => (
                    <div
                      key={assignment.id}
                      className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="text-gray-400">
                        {getCategoryIcon(assignment.asset.categoria.nombre)}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {assignment.asset.marca} {assignment.asset.modelo}
                        </p>
                        <p className="text-xs text-gray-500">
                          {assignment.asset.categoria.nombre} - {assignment.asset.numeroSerie || "Sin serie"}
                        </p>
                      </div>
                      <span className="text-xs text-gray-400">
                        {formatDate(assignment.fechaEntrega)}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-500">
                  <Package className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p>No tiene equipos asignados</p>
                </div>
              )}

              {/* Resumen de equipos a devolver */}
              <div className="mt-4 p-3 bg-orange-50 rounded-lg">
                <p className="text-sm font-medium text-orange-800 mb-2">
                  Equipos pendientes de devolución:
                </p>
                <div className="flex flex-wrap gap-2">
                  {hasNotebook && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                      <Laptop size={14} /> Notebook
                    </span>
                  )}
                  {hasCelular && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                      <Smartphone size={14} /> Celular
                    </span>
                  )}
                  {hasMonitor && (
                    <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                      <Monitor size={14} /> Monitor
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded">
                    <Package size={14} /> Kit/EPP
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Datos de desvinculación */}
      {employee && (
        <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <span className="w-8 h-8 rounded-full bg-red-100 text-red-600 flex items-center justify-center text-sm font-bold">
              3
            </span>
            Datos de la Desvinculación
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <Calendar className="inline h-4 w-4 mr-1" />
                Fecha de Desvinculación *
              </label>
              <input
                type="date"
                required
                value={formData.fechaDesvinculacion}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, fechaDesvinculacion: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <User className="inline h-4 w-4 mr-1" />
                Recibido por
              </label>
              <input
                type="text"
                placeholder="Nombre de quien recibirá los equipos"
                value={formData.recibidoPor}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, recibidoPor: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                <MapPin className="inline h-4 w-4 mr-1" />
                Lugar de Devolución
              </label>
              <input
                type="text"
                placeholder="Ej: Santiago, Rancagua, etc."
                value={formData.lugarDevolucion}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, lugarDevolucion: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observaciones
              </label>
              <textarea
                placeholder="Observaciones adicionales sobre la desvinculación..."
                rows={3}
                value={formData.observaciones}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, observaciones: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
              <AlertCircle size={20} />
              {error}
            </div>
          )}

          <div className="mt-6 flex justify-end gap-4">
            <Link
              href="/desvinculaciones"
              className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {submitting ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <UserMinus size={20} />
              )}
              Registrar Desvinculación
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
