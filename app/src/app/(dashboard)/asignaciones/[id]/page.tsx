"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  FileText,
  Undo2,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  User,
  Calendar,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  History,
  Building,
  Mail,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Assignment = {
  id: string;
  fechaEntrega: string;
  fechaDevolucion: string | null;
  lugarEntrega: string | null;
  entregadoPor: string | null;
  tipoMovimiento: string;
  motivo: string | null;
  activo: boolean;
  recibidoPor: string | null;
  estadoDevolucion: string | null;
  observacionesDevolucion: string | null;
  createdAt: string;
  updatedAt: string;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    procesador: string | null;
    ram: string | null;
    discoDuro: string | null;
    sistemaOperativo: string | null;
    imei: string | null;
    numeroTelefono: string | null;
    tipoPlan: string | null;
    estado: string;
    condicion: string;
    categoria: {
      id: string;
      nombre: string;
    };
    history: Array<{
      id: string;
      tipoEvento: string;
      descripcion: string;
      createdAt: string;
      usuarioSistema: string | null;
    }>;
  };
  employee: {
    id: string;
    rut: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    correo: string;
    cargo: string | null;
    jefatura: string | null;
    ubicacion: string | null;
  };
};

const tipoMovimientoLabels: Record<string, string> = {
  ingreso: "Ingreso",
  cambio: "Cambio",
  reemplazo: "Reemplazo",
  temporal: "Temporal",
};

const tipoMovimientoColors: Record<string, string> = {
  ingreso: "bg-green-100 text-green-800",
  cambio: "bg-blue-100 text-blue-800",
  reemplazo: "bg-purple-100 text-purple-800",
  temporal: "bg-orange-100 text-orange-800",
};

function getCategoryIcon(categoryName: string) {
  switch (categoryName.toLowerCase()) {
    case "notebook":
      return <Laptop className="h-6 w-6" />;
    case "celular":
      return <Smartphone className="h-6 w-6" />;
    case "monitor":
      return <Monitor className="h-6 w-6" />;
    default:
      return <Package className="h-6 w-6" />;
  }
}

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("es-CL", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString("es-CL", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AsignacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchAssignment();
  }, [id]);

  async function fetchAssignment() {
    try {
      const res = await fetch(`/api/asignaciones/${id}`);
      if (!res.ok) {
        throw new Error("Asignación no encontrada");
      }
      const data = await res.json();
      setAssignment(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar asignación");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/asignaciones" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Detalle de Asignación</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <AlertCircle className="h-5 w-5 text-red-500" />
          <p className="text-red-700">{error || "Asignación no encontrada"}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/asignaciones" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Detalle de Asignación</h1>
            <p className="text-gray-600">
              {assignment.asset.marca} {assignment.asset.modelo} → {assignment.employee.nombres}{" "}
              {assignment.employee.apellidoPaterno}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <a
            href={`/api/asignaciones/${assignment.id}/acta?tipo=${assignment.activo ? "entrega" : "devolucion"}`}
            target="_blank"
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <FileText size={20} />
            <span>Descargar Acta</span>
          </a>
          {assignment.activo && (
            <Link
              href={`/asignaciones/devolucion?id=${assignment.id}`}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
            >
              <Undo2 size={20} />
              <span>Registrar Devolución</span>
            </Link>
          )}
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={cn(
          "rounded-lg p-4 flex items-center justify-between",
          assignment.activo ? "bg-green-50 border border-green-200" : "bg-gray-50 border border-gray-200"
        )}
      >
        <div className="flex items-center gap-3">
          {assignment.activo ? (
            <Clock className="h-6 w-6 text-green-600" />
          ) : (
            <CheckCircle className="h-6 w-6 text-gray-600" />
          )}
          <div>
            <p className={cn("font-semibold", assignment.activo ? "text-green-800" : "text-gray-800")}>
              {assignment.activo ? "Asignación Activa" : "Equipo Devuelto"}
            </p>
            <p className={cn("text-sm", assignment.activo ? "text-green-600" : "text-gray-600")}>
              {assignment.activo
                ? `Desde ${formatDate(assignment.fechaEntrega)}`
                : `Devuelto el ${formatDate(assignment.fechaDevolucion)}`}
            </p>
          </div>
        </div>
        <span
          className={cn(
            "px-3 py-1 text-sm font-medium rounded-full",
            tipoMovimientoColors[assignment.tipoMovimiento]
          )}
        >
          {tipoMovimientoLabels[assignment.tipoMovimiento]}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Employee Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <User className="h-5 w-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold">Datos del Empleado</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-gray-400" />
              </div>
              <div>
                <p className="font-semibold text-lg">
                  {assignment.employee.nombres} {assignment.employee.apellidoPaterno}{" "}
                  {assignment.employee.apellidoMaterno}
                </p>
                <p className="text-gray-500 font-mono">{assignment.employee.rut}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">{assignment.employee.correo}</span>
              </div>
              {assignment.employee.cargo && (
                <div className="flex items-center gap-2 text-sm">
                  <Building className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{assignment.employee.cargo}</span>
                </div>
              )}
              {assignment.employee.jefatura && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">Jefatura: {assignment.employee.jefatura}</span>
                </div>
              )}
              {assignment.employee.ubicacion && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-gray-400" />
                  <span className="text-gray-600">{assignment.employee.ubicacion}</span>
                </div>
              )}
            </div>

            <Link
              href={`/empleados/${assignment.employee.id}`}
              className="block text-center text-sm text-blue-600 hover:underline pt-2"
            >
              Ver ficha completa del empleado →
            </Link>
          </div>
        </div>

        {/* Asset Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              {getCategoryIcon(assignment.asset.categoria.nombre)}
            </div>
            <h2 className="text-lg font-semibold">Datos del Equipo</h2>
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-lg">
                {assignment.asset.marca} {assignment.asset.modelo}
              </p>
              <p className="text-gray-500">{assignment.asset.categoria.nombre}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-gray-500 uppercase">N° Serie</p>
                <p className="font-mono">{assignment.asset.numeroSerie || "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Estado Actual</p>
                <span
                  className={cn(
                    "inline-block px-2 py-1 text-xs font-medium rounded-full mt-1",
                    assignment.asset.estado === "asignado"
                      ? "bg-blue-100 text-blue-800"
                      : assignment.asset.estado === "disponible"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-gray-800"
                  )}
                >
                  {assignment.asset.estado}
                </span>
              </div>

              {/* Campos específicos según categoría */}
              {assignment.asset.categoria.nombre.toLowerCase() === "notebook" && (
                <>
                  {assignment.asset.procesador && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Procesador</p>
                      <p>{assignment.asset.procesador}</p>
                    </div>
                  )}
                  {assignment.asset.ram && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">RAM</p>
                      <p>{assignment.asset.ram}</p>
                    </div>
                  )}
                  {assignment.asset.discoDuro && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Disco</p>
                      <p>{assignment.asset.discoDuro}</p>
                    </div>
                  )}
                  {assignment.asset.sistemaOperativo && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">S.O.</p>
                      <p>{assignment.asset.sistemaOperativo}</p>
                    </div>
                  )}
                </>
              )}

              {assignment.asset.categoria.nombre.toLowerCase() === "celular" && (
                <>
                  {assignment.asset.imei && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">IMEI</p>
                      <p className="font-mono">{assignment.asset.imei}</p>
                    </div>
                  )}
                  {assignment.asset.numeroTelefono && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">N° Teléfono</p>
                      <p>{assignment.asset.numeroTelefono}</p>
                    </div>
                  )}
                  {assignment.asset.tipoPlan && (
                    <div>
                      <p className="text-xs text-gray-500 uppercase">Plan</p>
                      <p>{assignment.asset.tipoPlan}</p>
                    </div>
                  )}
                </>
              )}
            </div>

            <Link
              href={`/activos/${assignment.asset.id}`}
              className="block text-center text-sm text-purple-600 hover:underline pt-2"
            >
              Ver ficha completa del equipo →
            </Link>
          </div>
        </div>

        {/* Delivery Info */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Datos de Entrega</h2>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Fecha de entrega</span>
              <span className="font-medium">{formatDate(assignment.fechaEntrega)}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Lugar de entrega</span>
              <span className="font-medium">{assignment.lugarEntrega || "-"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Entregado por</span>
              <span className="font-medium">{assignment.entregadoPor || "-"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-gray-500">Tipo de movimiento</span>
              <span
                className={cn(
                  "px-2 py-1 text-xs font-medium rounded-full",
                  tipoMovimientoColors[assignment.tipoMovimiento]
                )}
              >
                {tipoMovimientoLabels[assignment.tipoMovimiento]}
              </span>
            </div>
            {assignment.motivo && (
              <div className="py-2">
                <span className="text-gray-500 block mb-1">Motivo</span>
                <p className="text-sm">{assignment.motivo}</p>
              </div>
            )}
          </div>
        </div>

        {/* Return Info (if returned) */}
        {!assignment.activo && (
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Undo2 className="h-5 w-5 text-orange-600" />
              </div>
              <h2 className="text-lg font-semibold">Datos de Devolución</h2>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Fecha de devolución</span>
                <span className="font-medium">{formatDate(assignment.fechaDevolucion)}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Recibido por</span>
                <span className="font-medium">{assignment.recibidoPor || "-"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-gray-500">Estado al devolver</span>
                <span
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded-full",
                    assignment.estadoDevolucion === "ok"
                      ? "bg-green-100 text-green-800"
                      : "bg-red-100 text-red-800"
                  )}
                >
                  {assignment.estadoDevolucion === "ok" ? "Buen estado" : "Dañado"}
                </span>
              </div>
              {assignment.observacionesDevolucion && (
                <div className="py-2">
                  <span className="text-gray-500 block mb-1">Observaciones</span>
                  <p className="text-sm bg-gray-50 p-3 rounded-lg">
                    {assignment.observacionesDevolucion}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Asset History */}
      {assignment.asset.history && assignment.asset.history.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gray-100 rounded-lg">
              <History className="h-5 w-5 text-gray-600" />
            </div>
            <h2 className="text-lg font-semibold">Historial del Equipo</h2>
          </div>

          <div className="space-y-4">
            {assignment.asset.history.map((event, index) => (
              <div key={event.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-3 h-3 rounded-full",
                      event.tipoEvento === "asignacion"
                        ? "bg-blue-500"
                        : event.tipoEvento === "devolucion"
                        ? "bg-orange-500"
                        : "bg-gray-400"
                    )}
                  />
                  {index < assignment.asset.history.length - 1 && (
                    <div className="w-0.5 h-full bg-gray-200 my-1" />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <p className="text-sm font-medium">{event.descripcion}</p>
                  <p className="text-xs text-gray-500">
                    {formatDateTime(event.createdAt)}
                    {event.usuarioSistema && ` • ${event.usuarioSistema}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-500">
        <p>Registro creado: {formatDateTime(assignment.createdAt)}</p>
        <p>Última actualización: {formatDateTime(assignment.updatedAt)}</p>
      </div>
    </div>
  );
}
