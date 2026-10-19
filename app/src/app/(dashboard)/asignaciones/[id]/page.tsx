"use client";

import { mensajeDeError } from "@/shared/utilidades/apiErrors";
import { useState, useEffect, useCallback, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  // Se sigue usando en la seccion "Datos de Devolucion", que es solo
  // informativa (no hay boton para registrar una devolucion desde aca).
  Undo2,
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
import { etiquetaEstadoActivo, identificadorActivo } from "@/modules/activos";
import { EnlacesLineas } from "@/modules/lineas/componentes";
import { cn } from "@/shared/cn";
import { formatearFechaLarga, formatearFechaHoraCorta } from "@/shared/utilidades/fechas";
import { CategoryIcon } from "@/modules/activos/componentes";

type Assignment = {
  id: string;
  fechaEntrega: string | null;
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
    marca: { nombre: string };
    modelo: string;
    procesador: string | null;
    ram: string | null;
    discoDuro: string | null;
    sistemaOperativo: { nombre: string } | null;
    imei: string | null;
    lineas: { id: string; numero: string }[];
    estado: string;
    condicion: string;
    categoria: {
      id: string;
      nombre: string;
      tipoFicha: string;
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
    // El correo de empresa es el obligatorio.
    correoEmpresa: string;
    correoPersonal?: string | null;
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
  cambio: "bg-primary-100 text-primary-900",
  reemplazo: "bg-purple-100 text-purple-800",
  temporal: "bg-orange-100 text-orange-800",
};

// EstadoDevolucionEnum tiene 3 valores (ok | incompleto | danado); cada uno
// necesita su propia etiqueta, ya que "incompleto" no implica baja del activo.
const estadoDevolucionInfo: Record<string, { label: string; className: string }> = {
  ok: { label: "Buen estado", className: "bg-green-100 text-green-800" },
  incompleto: { label: "Incompleto", className: "bg-amber-100 text-amber-800" },
  danado: { label: "Dañado", className: "bg-red-100 text-red-800" },
};

export default function AsignacionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchAssignment = useCallback(async () => {
    try {
      const res = await fetch(`/api/asignaciones/${id}`);
      if (!res.ok) {
        throw new Error("Asignación no encontrada");
      }
      const data = await res.json();
      setAssignment(data);
    } catch (err) {
      setError(mensajeDeError(err, "Error al cargar asignación"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchAssignment();
  }, [fetchAssignment]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary-700" />
      </div>
    );
  }

  if (error || !assignment) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/activos/asignaciones" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold text-fg">Detalle de Asignación</h1>
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
          <Link href="/activos/asignaciones" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-fg">Detalle de Asignación</h1>
            <p className="text-fg-muted">
              {assignment.asset.marca.nombre} {assignment.asset.modelo} → {assignment.employee.nombres}{" "}
              {assignment.employee.apellidoPaterno}
            </p>
          </div>
        </div>
      </div>

      {/* Status Banner */}
      <div
        className={cn(
          "rounded-lg p-4 flex items-center justify-between",
          assignment.activo ? "bg-green-50 border border-green-200" : "bg-surface-muted border border-line"
        )}
      >
        <div className="flex items-center gap-3">
          {assignment.activo ? (
            <Clock className="h-6 w-6 text-green-600" />
          ) : (
            <CheckCircle className="h-6 w-6 text-fg-muted" />
          )}
          <div>
            <p className={cn("font-semibold", assignment.activo ? "text-green-800" : "text-fg")}>
              {assignment.activo ? "Asignación Activa" : "Equipo Devuelto"}
            </p>
            <p className={cn("text-sm", assignment.activo ? "text-green-600" : "text-fg-muted")}>
              {assignment.activo
                ? `Desde ${formatearFechaLarga(assignment.fechaEntrega, "-")}`
                : `Devuelto el ${formatearFechaLarga(assignment.fechaDevolucion, "-")}`}
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
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-primary-100 rounded-lg">
              <User className="h-5 w-5 text-primary-700" />
            </div>
            <h2 className="text-lg font-semibold">Datos del Empleado</h2>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                <User className="h-6 w-6 text-fg-subtle" />
              </div>
              <div>
                <p className="font-semibold text-lg">
                  <Link href={`/empleados/${assignment.employee.id}`} className="text-primary-700 hover:underline">
                    {assignment.employee.nombres} {assignment.employee.apellidoPaterno}{" "}
                    {assignment.employee.apellidoMaterno}
                  </Link>
                </p>
                <p className="text-fg-subtle font-mono">{assignment.employee.rut}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-fg-subtle" />
                <span className="text-fg-muted">{assignment.employee.correoEmpresa ?? assignment.employee.correoPersonal ?? ''}</span>
              </div>
              {assignment.employee.cargo && (
                <div className="flex items-center gap-2 text-sm">
                  <Building className="h-4 w-4 text-fg-subtle" />
                  <span className="text-fg-muted">{assignment.employee.cargo}</span>
                </div>
              )}
              {assignment.employee.jefatura && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="h-4 w-4 text-fg-subtle" />
                  <span className="text-fg-muted">Jefatura: {assignment.employee.jefatura}</span>
                </div>
              )}
              {assignment.employee.ubicacion && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="h-4 w-4 text-fg-subtle" />
                  <span className="text-fg-muted">{assignment.employee.ubicacion}</span>
                </div>
              )}
            </div>

            <Link
              href={`/empleados/${assignment.employee.id}`}
              className="block text-center text-sm text-primary-700 hover:underline pt-2"
            >
              Ver ficha completa del empleado →
            </Link>
          </div>
        </div>

        {/* Asset Info */}
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-purple-100 rounded-lg">
              <CategoryIcon categoria={assignment.asset.categoria.nombre} className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">Datos del Equipo</h2>
          </div>

          <div className="space-y-4">
            <div>
              <p className="font-semibold text-lg">
                {assignment.asset.marca.nombre} {assignment.asset.modelo}
              </p>
              <p className="text-fg-subtle">{assignment.asset.categoria.nombre}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-fg-subtle uppercase">N° Serie</p>
                <p className="font-mono">{identificadorActivo(assignment.asset, "-")}</p>
              </div>
              <div>
                <p className="text-xs text-fg-subtle uppercase">Estado Actual</p>
                <span
                  className={cn(
                    "inline-block px-2 py-1 text-xs font-medium rounded-full mt-1",
                    assignment.asset.estado === "asignado"
                      ? "bg-primary-100 text-primary-900"
                      : assignment.asset.estado === "disponible"
                      ? "bg-green-100 text-green-800"
                      : "bg-gray-100 text-fg"
                  )}
                >
                  {etiquetaEstadoActivo(assignment.asset.estado)}
                </span>
              </div>

              {/* Campos específicos según categoría */}
              {assignment.asset.categoria.tipoFicha === "computador" && (
                <>
                  {assignment.asset.procesador && (
                    <div>
                      <p className="text-xs text-fg-subtle uppercase">Procesador</p>
                      <p>{assignment.asset.procesador}</p>
                    </div>
                  )}
                  {assignment.asset.ram && (
                    <div>
                      <p className="text-xs text-fg-subtle uppercase">RAM</p>
                      <p>{assignment.asset.ram}</p>
                    </div>
                  )}
                  {assignment.asset.discoDuro && (
                    <div>
                      <p className="text-xs text-fg-subtle uppercase">Disco</p>
                      <p>{assignment.asset.discoDuro}</p>
                    </div>
                  )}
                  {assignment.asset.sistemaOperativo && (
                    <div>
                      <p className="text-xs text-fg-subtle uppercase">S.O.</p>
                      <p>{assignment.asset.sistemaOperativo.nombre}</p>
                    </div>
                  )}
                </>
              )}

              {assignment.asset.categoria.tipoFicha === "celular" && (
                <>
                  {assignment.asset.imei && (
                    <div>
                      <p className="text-xs text-fg-subtle uppercase">IMEI</p>
                      <p className="font-mono">{assignment.asset.imei}</p>
                    </div>
                  )}
                  {assignment.asset.lineas.length > 0 && (
                    <div>
                      <p className="text-xs text-fg-subtle uppercase">Línea</p>
                      <p><EnlacesLineas lineas={assignment.asset.lineas} /></p>
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
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Calendar className="h-5 w-5 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Datos de Entrega</h2>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b">
              <span className="text-fg-subtle">Fecha de entrega</span>
              <span className="font-medium">{formatearFechaLarga(assignment.fechaEntrega, "-")}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-fg-subtle">Lugar de entrega</span>
              <span className="font-medium">{assignment.lugarEntrega || "-"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-fg-subtle">Entregado por</span>
              <span className="font-medium">{assignment.entregadoPor || "-"}</span>
            </div>
            <div className="flex justify-between py-2 border-b">
              <span className="text-fg-subtle">Tipo de movimiento</span>
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
                <span className="text-fg-subtle block mb-1">Motivo</span>
                <p className="text-sm">{assignment.motivo}</p>
              </div>
            )}
          </div>
        </div>

        {/* Return Info (if returned) */}
        {!assignment.activo && (
          <div className="card p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-orange-100 rounded-lg">
                <Undo2 className="h-5 w-5 text-orange-600" />
              </div>
              <h2 className="text-lg font-semibold">Datos de Devolución</h2>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b">
                <span className="text-fg-subtle">Fecha de devolución</span>
                <span className="font-medium">{formatearFechaLarga(assignment.fechaDevolucion, "-")}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-fg-subtle">Recibido por</span>
                <span className="font-medium">{assignment.recibidoPor || "-"}</span>
              </div>
              <div className="flex justify-between py-2 border-b">
                <span className="text-fg-subtle">Estado al devolver</span>
                <span
                  className={cn(
                    "px-2 py-1 text-xs font-medium rounded-full",
                    (assignment.estadoDevolucion && estadoDevolucionInfo[assignment.estadoDevolucion]?.className) ||
                      "bg-gray-100 text-fg"
                  )}
                >
                  {(assignment.estadoDevolucion && estadoDevolucionInfo[assignment.estadoDevolucion]?.label) || "-"}
                </span>
              </div>
              {assignment.observacionesDevolucion && (
                <div className="py-2">
                  <span className="text-fg-subtle block mb-1">Observaciones</span>
                  <p className="text-sm bg-surface-muted p-3 rounded-lg">
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
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-gray-100 rounded-lg">
              <History className="h-5 w-5 text-fg-muted" />
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
                        ? "bg-primary-500"
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
                  <p className="text-xs text-fg-subtle">
                    {formatearFechaHoraCorta(event.createdAt, "-")}
                    {event.usuarioSistema && ` • ${event.usuarioSistema}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timestamps */}
      <div className="bg-surface-muted rounded-lg p-4 text-sm text-fg-subtle">
        <p>Registro creado: {formatearFechaHoraCorta(assignment.createdAt, "-")}</p>
        <p>Última actualización: {formatearFechaHoraCorta(assignment.updatedAt, "-")}</p>
      </div>
    </div>
  );
}
