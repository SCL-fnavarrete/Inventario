"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  User,
  Calendar,
  MapPin,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  Loader2,
  DollarSign,
  Bell,
  Trash2,
  Calculator,
  Plus,
  Minus,
  BatteryCharging,
  Headphones,
  Backpack,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  fechaEntrega: string;
  fechaDevolucion: string | null;
  activo: boolean;
  estadoDevolucion: string | null;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    estado: string;
    categoria: {
      nombre: string;
    };
  };
};

type KitAssignment = {
  id: string;
  fechaEntrega: string;
  estado: string;
  item: {
    id: string;
    nombre: string;
    categoria: string;
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
  kitAssignments: KitAssignment[];
};

type Termination = {
  id: string;
  fechaDesvinculacion: string;
  fechaDevolucionEquipos: string | null;
  estadoNotebook: string;
  estadoCelular: string;
  estadoMonitor: string;
  estadoKit: string;
  recibidoPor: string | null;
  lugarDevolucion: string | null;
  requiereDescuento: boolean;
  montoDescuento: number | null;
  motivoDescuento: string | null;
  notificadoRrhh: boolean;
  fechaNotificacionRrhh: string | null;
  observaciones: string | null;
  employee: Employee;
};

const estadoOptions = [
  { value: "ok", label: "OK", icon: CheckCircle, color: "text-green-600" },
  { value: "danado", label: "Dañado", icon: XCircle, color: "text-red-600" },
  { value: "no_aplica", label: "No Aplica", icon: Clock, color: "text-gray-400" },
  { value: "pendiente", label: "Pendiente", icon: Clock, color: "text-orange-500" },
];

const estadoLabels: Record<string, string> = {
  ok: "OK",
  danado: "Dañado",
  no_aplica: "No Aplica",
  pendiente: "Pendiente",
};

const estadoColors: Record<string, string> = {
  ok: "bg-green-100 text-green-800 border-green-300",
  danado: "bg-red-100 text-red-800 border-red-300",
  no_aplica: "bg-gray-100 text-gray-500 border-gray-300",
  pendiente: "bg-orange-100 text-orange-800 border-orange-300",
};

// Valores de descuento por tipo de activo
const discountValues: Record<string, number> = {
  notebook: 500000,
  cargador_notebook: 50000,
  celular: 200000,
  cargador_celular: 30000,
  epp: 10000,
  monitor: 150000,
  cargador_monitor: 50000,
  audifonos_targus: 50000,
  mochila: 40000,
};

type CustomDiscount = {
  id: string;
  amount: number;
  reason: string;
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

function formatCurrency(amount: number | null): string {
  if (!amount) return "$0";
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
  }).format(amount);
}

export default function DesvinculacionDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const [termination, setTermination] = useState<Termination | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Form state for return processing
  const [returnForm, setReturnForm] = useState({
    fechaDevolucionEquipos: new Date().toISOString().split("T")[0],
    estadoNotebook: "pendiente",
    estadoCargadorNotebook: "pendiente",
    estadoCelular: "pendiente",
    estadoCargadorCelular: "pendiente",
    estadoMonitor: "pendiente",
    estadoCargadorMonitor: "pendiente",
    estadoAudifonos: "pendiente",
    estadoMochila: "pendiente",
    estadoKit: "pendiente",
    recibidoPor: "",
    lugarDevolucion: "",
    requiereDescuento: false,
    montoDescuento: "",
    motivoDescuento: "",
    observaciones: "",
  });

  // Estado para descuentos personalizados
  const [customDiscounts, setCustomDiscounts] = useState<CustomDiscount[]>([]);

  useEffect(() => {
    fetchTermination();
  }, [id]);

  // Calcular el descuento automático basado en el estado de los equipos
  useEffect(() => {
    if (returnForm.requiereDescuento) {
      calculateAutomaticDiscount();
    }
  }, [
    returnForm.requiereDescuento,
    returnForm.estadoNotebook,
    returnForm.estadoCargadorNotebook,
    returnForm.estadoCelular,
    returnForm.estadoCargadorCelular,
    returnForm.estadoMonitor,
    returnForm.estadoCargadorMonitor,
    returnForm.estadoAudifonos,
    returnForm.estadoMochila,
    returnForm.estadoKit,
    customDiscounts,
  ]);

  function calculateAutomaticDiscount() {
    let total = 0;

    // Sumar descuentos por equipos dañados
    if (returnForm.estadoNotebook === "danado") {
      total += discountValues.notebook;
    }
    if (returnForm.estadoCargadorNotebook === "danado") {
      total += discountValues.cargador_notebook;
    }
    if (returnForm.estadoCelular === "danado") {
      total += discountValues.celular;
    }
    if (returnForm.estadoCargadorCelular === "danado") {
      total += discountValues.cargador_celular;
    }
    if (returnForm.estadoMonitor === "danado") {
      total += discountValues.monitor;
    }
    if (returnForm.estadoCargadorMonitor === "danado") {
      total += discountValues.cargador_monitor;
    }
    if (returnForm.estadoAudifonos === "danado") {
      total += discountValues.audifonos_targus;
    }
    if (returnForm.estadoMochila === "danado") {
      total += discountValues.mochila;
    }
    if (returnForm.estadoKit === "danado") {
      total += discountValues.epp;
    }

    // Sumar descuentos personalizados
    const customTotal = customDiscounts.reduce((sum, discount) => sum + discount.amount, 0);
    total += customTotal;

    // Actualizar el monto de descuento
    setReturnForm((prev) => ({
      ...prev,
      montoDescuento: total.toString(),
    }));
  }

  function addCustomDiscount() {
    const newDiscount: CustomDiscount = {
      id: `custom-${Date.now()}`,
      amount: 0,
      reason: "",
    };
    setCustomDiscounts((prev) => [...prev, newDiscount]);
  }

  function removeCustomDiscount(id: string) {
    setCustomDiscounts((prev) => prev.filter((d) => d.id !== id));
  }

  function updateCustomDiscount(id: string, field: "amount" | "reason", value: number | string) {
    setCustomDiscounts((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          return { ...d, [field]: value };
        }
        return d;
      })
    );
  }

  async function fetchTermination() {
    try {
      const res = await fetch(`/api/desvinculaciones/${id}`);
      if (!res.ok) {
        throw new Error("Desvinculación no encontrada");
      }
      const data = await res.json();
      setTermination(data);

      // Initialize form with existing data
      setReturnForm((prev) => ({
        ...prev,
        fechaDevolucionEquipos: data.fechaDevolucionEquipos
          ? new Date(data.fechaDevolucionEquipos).toISOString().split("T")[0]
          : new Date().toISOString().split("T")[0],
        estadoNotebook: data.estadoNotebook,
        estadoCelular: data.estadoCelular,
        estadoMonitor: data.estadoMonitor,
        estadoKit: data.estadoKit,
        recibidoPor: data.recibidoPor || "",
        lugarDevolucion: data.lugarDevolucion || "",
        requiereDescuento: data.requiereDescuento,
        montoDescuento: data.montoDescuento?.toString() || "",
        motivoDescuento: data.motivoDescuento || "",
        observaciones: data.observaciones || "",
      }));
    } catch (err) {
      console.error("Error fetching termination:", err);
      setError("Error al cargar desvinculación");
    } finally {
      setLoading(false);
    }
  }

  async function handleProcessReturn(e: React.FormEvent) {
    e.preventDefault();
    if (!termination) return;

    setSubmitting(true);
    setError("");

    try {
      // Construir el motivo del descuento con los descuentos personalizados
      let motivoDescuento = "";
      const damagedItems = [];

      if (returnForm.estadoNotebook === "danado") {
        damagedItems.push(`Notebook: ${formatCurrency(discountValues.notebook)}`);
      }
      if (returnForm.estadoCargadorNotebook === "danado") {
        damagedItems.push(`Cargador Notebook: ${formatCurrency(discountValues.cargador_notebook)}`);
      }
      if (returnForm.estadoCelular === "danado") {
        damagedItems.push(`Celular: ${formatCurrency(discountValues.celular)}`);
      }
      if (returnForm.estadoCargadorCelular === "danado") {
        damagedItems.push(`Cargador Celular: ${formatCurrency(discountValues.cargador_celular)}`);
      }
      if (returnForm.estadoMonitor === "danado") {
        damagedItems.push(`Monitor: ${formatCurrency(discountValues.monitor)}`);
      }
      if (returnForm.estadoCargadorMonitor === "danado") {
        damagedItems.push(`Cargador Monitor: ${formatCurrency(discountValues.cargador_monitor)}`);
      }
      if (returnForm.estadoAudifonos === "danado") {
        damagedItems.push(`Audífonos Targus: ${formatCurrency(discountValues.audifonos_targus)}`);
      }
      if (returnForm.estadoMochila === "danado") {
        damagedItems.push(`Mochila: ${formatCurrency(discountValues.mochila)}`);
      }
      if (returnForm.estadoKit === "danado") {
        damagedItems.push(`EPP/Kit: ${formatCurrency(discountValues.epp)}`);
      }

      if (damagedItems.length > 0) {
        motivoDescuento = `Equipos dañados: ${damagedItems.join(", ")}`;
      }

      if (customDiscounts.length > 0) {
        const customItems = customDiscounts
          .filter((d) => d.amount > 0 && d.reason.trim())
          .map((d) => `${d.reason}: ${formatCurrency(d.amount)}`);

        if (customItems.length > 0) {
          if (motivoDescuento) {
            motivoDescuento += `. Descuentos adicionales: ${customItems.join(", ")}`;
          } else {
            motivoDescuento = `Descuentos adicionales: ${customItems.join(", ")}`;
          }
        }
      }

      const res = await fetch(`/api/desvinculaciones/${id}/procesar-devolucion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fechaDevolucionEquipos: returnForm.fechaDevolucionEquipos,
          estadoNotebook: returnForm.estadoNotebook,
          estadoCelular: returnForm.estadoCelular,
          estadoMonitor: returnForm.estadoMonitor,
          estadoKit: returnForm.estadoKit,
          recibidoPor: returnForm.recibidoPor,
          lugarDevolucion: returnForm.lugarDevolucion,
          requiereDescuento: returnForm.requiereDescuento,
          montoDescuento: returnForm.montoDescuento
            ? parseFloat(returnForm.montoDescuento)
            : null,
          motivoDescuento: motivoDescuento || null,
          observaciones: returnForm.observaciones || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Error al procesar devolución");
        return;
      }

      // Reload data
      fetchTermination();
    } catch (err) {
      console.error("Error processing return:", err);
      setError("Error al procesar devolución");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!termination) return;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/desvinculaciones/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al eliminar");
        return;
      }

      router.push("/desvinculaciones");
    } catch (err) {
      console.error("Error deleting:", err);
      setError("Error al eliminar desvinculación");
    } finally {
      setSubmitting(false);
      setShowDeleteConfirm(false);
    }
  }

  // Check if all returns are processed
  const allProcessed =
    termination &&
    termination.estadoNotebook !== "pendiente" &&
    termination.estadoCelular !== "pendiente" &&
    termination.estadoMonitor !== "pendiente" &&
    termination.estadoKit !== "pendiente";

  // Check if any damage exists
  const hasDamage =
    termination &&
    (termination.estadoNotebook === "danado" ||
      termination.estadoCelular === "danado" ||
      termination.estadoMonitor === "danado");

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!termination) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-red-800">Desvinculación no encontrada</h2>
        <Link href="/desvinculaciones" className="text-red-600 hover:underline mt-2 inline-block">
          Volver al listado
        </Link>
      </div>
    );
  }

  const employee = termination.employee;
  const activeAssignments = employee.assignments.filter((a) => a.activo);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/desvinculaciones"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Detalle de Desvinculación</h1>
            <p className="text-gray-600">
              {employee.nombres} {employee.apellidoPaterno} - {employee.rut}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/desvinculaciones/${id}/reporte-rrhh`}
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            <FileText size={20} />
            Reporte RRHH
          </a>
          {!allProcessed && (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <Trash2 size={20} />
              Eliminar
            </button>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={cn(
          "rounded-lg p-4 flex items-center justify-between",
          allProcessed ? "bg-green-50 border border-green-200" : "bg-orange-50 border border-orange-200"
        )}
      >
        <div className="flex items-center gap-3">
          {allProcessed ? (
            <CheckCircle className="h-6 w-6 text-green-600" />
          ) : (
            <Clock className="h-6 w-6 text-orange-600" />
          )}
          <div>
            <p className={cn("font-semibold", allProcessed ? "text-green-800" : "text-orange-800")}>
              {allProcessed ? "Devolución Completada" : "Devolución Pendiente"}
            </p>
            <p className={cn("text-sm", allProcessed ? "text-green-600" : "text-orange-600")}>
              {allProcessed
                ? `Procesada el ${formatDate(termination.fechaDevolucionEquipos)}`
                : "Equipos pendientes de devolución"}
            </p>
          </div>
        </div>
        {termination.notificadoRrhh && (
          <span className="flex items-center gap-2 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm">
            <Bell size={16} />
            RRHH Notificado
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Employee Info */}
        <div className="lg:col-span-1 space-y-6">
          {/* Employee Card */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <User className="h-5 w-5" />
              Datos del Empleado
            </h2>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-gray-500">Nombre Completo</p>
                <p className="font-medium">
                  {employee.nombres} {employee.apellidoPaterno} {employee.apellidoMaterno}
                </p>
              </div>
              <div>
                <p className="text-gray-500">RUT</p>
                <p className="font-mono font-medium">{employee.rut}</p>
              </div>
              <div>
                <p className="text-gray-500">Correo</p>
                <p className="font-medium">{employee.correoPersonal}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500">Cargo</p>
                  <p className="font-medium">{employee.cargo || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Ubicación</p>
                  <p className="font-medium">{employee.ubicacion || "-"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-gray-500">Fecha Ingreso</p>
                  <p className="font-medium">{formatDate(employee.fechaIngreso)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Fecha Término</p>
                  <p className="font-medium">{formatDate(termination.fechaDesvinculacion)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Equipment List */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Equipos Asignados</h2>
            {employee.assignments.length > 0 ? (
              <div className="space-y-3">
                {employee.assignments.map((assignment) => (
                  <div
                    key={assignment.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border",
                      assignment.activo ? "bg-orange-50 border-orange-200" : "bg-gray-50 border-gray-200"
                    )}
                  >
                    <span className={assignment.activo ? "text-orange-500" : "text-gray-400"}>
                      {getCategoryIcon(assignment.asset.categoria.nombre)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {assignment.asset.marca} {assignment.asset.modelo}
                      </p>
                      <p className="text-xs text-gray-500">
                        {assignment.asset.numeroSerie || "Sin serie"}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "px-2 py-0.5 text-xs rounded",
                        assignment.activo
                          ? "bg-orange-100 text-orange-700"
                          : "bg-gray-100 text-gray-600"
                      )}
                    >
                      {assignment.activo ? "Pendiente" : "Devuelto"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-center py-4">No hay equipos registrados</p>
            )}
          </div>
        </div>

        {/* Right Column - Return Processing Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleProcessReturn} className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-6">Procesar Devolución de Equipos</h2>

            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Calendar className="inline h-4 w-4 mr-1" />
                  Fecha Devolución *
                </label>
                <input
                  type="date"
                  required
                  value={returnForm.fechaDevolucionEquipos}
                  onChange={(e) =>
                    setReturnForm((prev) => ({ ...prev, fechaDevolucionEquipos: e.target.value }))
                  }
                  disabled={!!allProcessed}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <User className="inline h-4 w-4 mr-1" />
                  Recibido por *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nombre"
                  value={returnForm.recibidoPor}
                  onChange={(e) =>
                    setReturnForm((prev) => ({ ...prev, recibidoPor: e.target.value }))
                  }
                  disabled={!!allProcessed}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <MapPin className="inline h-4 w-4 mr-1" />
                  Lugar *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ubicación"
                  value={returnForm.lugarDevolucion}
                  onChange={(e) =>
                    setReturnForm((prev) => ({ ...prev, lugarDevolucion: e.target.value }))
                  }
                  disabled={!!allProcessed}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
                />
              </div>
            </div>

            {/* Equipment Status */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Estado de Devolución por Equipo</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* Notebook */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Laptop className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Notebook</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.notebook)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoNotebook: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoNotebook === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cargador Notebook */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BatteryCharging className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Cargador Notebook</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.cargador_notebook)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoCargadorNotebook: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoCargadorNotebook === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Celular */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Smartphone className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Celular</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.celular)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoCelular: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoCelular === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cargador Celular */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BatteryCharging className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Cargador Celular</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.cargador_celular)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoCargadorCelular: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoCargadorCelular === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Monitor */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Monitor</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.monitor)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoMonitor: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoMonitor === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cargador Monitor */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <BatteryCharging className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Cargador Monitor</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.cargador_monitor)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoCargadorMonitor: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoCargadorMonitor === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Audífonos Targus */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Headphones className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Audífonos Targus</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.audifonos_targus)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoAudifonos: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoAudifonos === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mochila */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Backpack className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Mochila</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.mochila)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoMochila: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoMochila === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Kit / EPP */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Package className="h-5 w-5 text-gray-600" />
                      <span className="font-medium">Kit Bienvenida / EPP</span>
                    </div>
                    <span className="text-xs text-gray-400">{formatCurrency(discountValues.epp)}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {estadoOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!!allProcessed}
                        onClick={() =>
                          setReturnForm((prev) => ({ ...prev, estadoKit: option.value }))
                        }
                        className={cn(
                          "flex items-center gap-1 px-3 py-1.5 rounded-lg border text-sm transition-colors",
                          returnForm.estadoKit === option.value
                            ? estadoColors[option.value]
                            : "border-gray-200 hover:border-gray-300",
                          allProcessed && "opacity-75 cursor-not-allowed"
                        )}
                      >
                        <option.icon size={16} className={option.color} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Discount Section - Enhanced */}
            <div className="mb-6">
              <div className="border rounded-lg bg-gradient-to-br from-red-50 to-orange-50">
                {/* Header */}
                <div className="p-4 border-b bg-white/50">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={returnForm.requiereDescuento}
                      onChange={(e) => {
                        setReturnForm((prev) => ({ ...prev, requiereDescuento: e.target.checked }));
                        if (!e.target.checked) {
                          setCustomDiscounts([]);
                        }
                      }}
                      disabled={!!allProcessed}
                      className="w-5 h-5 text-red-600 rounded focus:ring-red-500"
                    />
                    <span className="font-semibold text-gray-800 flex items-center gap-2 text-lg">
                      <DollarSign className="h-5 w-5" />
                      Requiere Descuento
                    </span>
                  </label>
                </div>

                {returnForm.requiereDescuento && (
                  <div className="p-4 space-y-4">
                    {/* Automatic Discounts Breakdown */}
                    <div className="bg-white rounded-lg p-4 border border-red-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Calculator className="h-5 w-5 text-red-600" />
                        <h3 className="font-semibold text-gray-800">Descuentos Automáticos</h3>
                      </div>

                      <div className="space-y-2">
                        {/* Notebook */}
                        {returnForm.estadoNotebook === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <Laptop className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Notebook Dañado</p>
                                <p className="text-xs text-gray-500">Equipo devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.notebook)}
                            </span>
                          </div>
                        )}

                        {/* Cargador Notebook */}
                        {returnForm.estadoCargadorNotebook === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <BatteryCharging className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Cargador Notebook Dañado</p>
                                <p className="text-xs text-gray-500">Accesorio devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.cargador_notebook)}
                            </span>
                          </div>
                        )}

                        {/* Celular */}
                        {returnForm.estadoCelular === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <Smartphone className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Celular Dañado</p>
                                <p className="text-xs text-gray-500">Equipo devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.celular)}
                            </span>
                          </div>
                        )}

                        {/* Cargador Celular */}
                        {returnForm.estadoCargadorCelular === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <BatteryCharging className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Cargador Celular Dañado</p>
                                <p className="text-xs text-gray-500">Accesorio devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.cargador_celular)}
                            </span>
                          </div>
                        )}

                        {/* Monitor */}
                        {returnForm.estadoMonitor === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <Monitor className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Monitor Dañado</p>
                                <p className="text-xs text-gray-500">Equipo devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.monitor)}
                            </span>
                          </div>
                        )}

                        {/* Cargador Monitor */}
                        {returnForm.estadoCargadorMonitor === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <BatteryCharging className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Cargador Monitor Dañado</p>
                                <p className="text-xs text-gray-500">Accesorio devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.cargador_monitor)}
                            </span>
                          </div>
                        )}

                        {/* Audífonos Targus */}
                        {returnForm.estadoAudifonos === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <Headphones className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Audífonos Targus Dañados</p>
                                <p className="text-xs text-gray-500">Accesorio devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.audifonos_targus)}
                            </span>
                          </div>
                        )}

                        {/* Mochila */}
                        {returnForm.estadoMochila === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <Backpack className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">Mochila Dañada</p>
                                <p className="text-xs text-gray-500">Accesorio devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.mochila)}
                            </span>
                          </div>
                        )}

                        {/* EPP/Kit */}
                        {returnForm.estadoKit === "danado" && (
                          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                            <div className="flex items-center gap-3">
                              <Package className="h-5 w-5 text-red-600" />
                              <div>
                                <p className="font-medium text-gray-800">EPP/Kit Dañado</p>
                                <p className="text-xs text-gray-500">Kit devuelto con daño</p>
                              </div>
                            </div>
                            <span className="font-bold text-red-600">
                              {formatCurrency(discountValues.epp)}
                            </span>
                          </div>
                        )}

                        {/* No damage message */}
                        {returnForm.estadoNotebook !== "danado" &&
                          returnForm.estadoCargadorNotebook !== "danado" &&
                          returnForm.estadoCelular !== "danado" &&
                          returnForm.estadoCargadorCelular !== "danado" &&
                          returnForm.estadoMonitor !== "danado" &&
                          returnForm.estadoCargadorMonitor !== "danado" &&
                          returnForm.estadoAudifonos !== "danado" &&
                          returnForm.estadoMochila !== "danado" &&
                          returnForm.estadoKit !== "danado" && (
                            <div className="text-center py-4 text-gray-500 text-sm">
                              No hay equipos marcados como dañados
                            </div>
                          )}
                      </div>
                    </div>

                    {/* Custom Discounts */}
                    <div className="bg-white rounded-lg p-4 border border-orange-200">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Package className="h-5 w-5 text-orange-600" />
                          <h3 className="font-semibold text-gray-800">Descuentos Adicionales</h3>
                        </div>
                        <button
                          type="button"
                          onClick={addCustomDiscount}
                          disabled={!!allProcessed}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          <Plus className="h-4 w-4" />
                          Agregar
                        </button>
                      </div>

                      {customDiscounts.length > 0 ? (
                        <div className="space-y-3">
                          {customDiscounts.map((discount) => (
                            <div
                              key={discount.id}
                              className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg border border-orange-200"
                            >
                              <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Monto (CLP)
                                  </label>
                                  <input
                                    type="number"
                                    placeholder="0"
                                    min="0"
                                    value={discount.amount || ""}
                                    onChange={(e) =>
                                      updateCustomDiscount(
                                        discount.id,
                                        "amount",
                                        parseFloat(e.target.value) || 0
                                      )
                                    }
                                    disabled={!!allProcessed}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Motivo
                                  </label>
                                  <input
                                    type="text"
                                    placeholder="Ej: Cargador extraviado"
                                    value={discount.reason}
                                    onChange={(e) =>
                                      updateCustomDiscount(discount.id, "reason", e.target.value)
                                    }
                                    disabled={!!allProcessed}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 disabled:bg-gray-100"
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeCustomDiscount(discount.id)}
                                disabled={!!allProcessed}
                                className="p-2 text-red-600 hover:bg-red-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Eliminar descuento"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-500 text-sm">
                          No hay descuentos adicionales. Haz clic en &quot;Agregar&quot; para crear uno.
                        </div>
                      )}
                    </div>

                    {/* Total Summary */}
                    <div className="bg-gradient-to-r from-red-600 to-orange-600 rounded-lg p-4 text-white">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm opacity-90">Total a Descontar</p>
                          <p className="text-xs opacity-75 mt-1">
                            Este monto será reportado a RRHH
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-3xl font-bold">
                            {formatCurrency(parseFloat(returnForm.montoDescuento) || 0)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Motivo General (hidden field for compatibility) */}
                    <input
                      type="hidden"
                      value={returnForm.motivoDescuento}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Observations */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Observaciones
              </label>
              <textarea
                placeholder="Observaciones adicionales sobre la devolución..."
                rows={3}
                value={returnForm.observaciones}
                onChange={(e) =>
                  setReturnForm((prev) => ({ ...prev, observaciones: e.target.value }))
                }
                disabled={!!allProcessed}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 disabled:bg-gray-100"
              />
            </div>

            {error && (
              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700">
                <AlertCircle size={20} />
                {error}
              </div>
            )}

            {/* Actions */}
            {!allProcessed && (
              <div className="flex justify-end gap-4">
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
                    <CheckCircle size={20} />
                  )}
                  Procesar Devolución
                </button>
              </div>
            )}
          </form>

          {/* Summary Card (shown after processing) */}
          {allProcessed && (
            <div className="mt-6 bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4">Resumen de Devolución</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Fecha Devolución</p>
                  <p className="font-medium">{formatDate(termination.fechaDevolucionEquipos)}</p>
                </div>
                <div>
                  <p className="text-gray-500">Recibido por</p>
                  <p className="font-medium">{termination.recibidoPor || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Lugar</p>
                  <p className="font-medium">{termination.lugarDevolucion || "-"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Descuento</p>
                  <p className={cn("font-medium", termination.requiereDescuento && "text-red-600")}>
                    {termination.requiereDescuento
                      ? formatCurrency(termination.montoDescuento)
                      : "No aplica"}
                  </p>
                </div>
              </div>
              {termination.motivoDescuento && (
                <div className="mt-4">
                  <p className="text-gray-500 text-sm">Motivo Descuento</p>
                  <p className="font-medium text-red-600">{termination.motivoDescuento}</p>
                </div>
              )}
              {termination.observaciones && (
                <div className="mt-4">
                  <p className="text-gray-500 text-sm">Observaciones</p>
                  <p className="text-gray-700">{termination.observaciones}</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-2">Confirmar Eliminación</h3>
            <p className="text-gray-600 mb-4">
              ¿Está seguro de eliminar esta desvinculación? El empleado volverá a estado activo.
            </p>
            <div className="flex justify-end gap-4">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
