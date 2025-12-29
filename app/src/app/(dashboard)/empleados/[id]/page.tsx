"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Edit,
  Laptop,
  Smartphone,
  Monitor,
  Package,
  CheckCircle,
  XCircle,
  Calendar,
  MapPin,
  Mail,
  Phone,
  User,
  Building,
  Briefcase,
  HardHat,
  Gift,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReturnAssetModal, { ReturnAssetData } from "@/components/ReturnAssetModal";

type NotebookAsignado = {
  asignacionId: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  procesador: string | null;
  discoDuro: string | null;
  ram: string | null;
  pulgadas: number | null;
  sistemaOperativo: string | null;
  microsoft365: boolean;
  estado: string;
  condicion: string;
  fechaEntrega: string;
  lugarEntrega: string | null;
  entregadoPor: string | null;
};

type CelularAsignado = {
  asignacionId: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  imei: string | null;
  numeroTelefono: string | null;
  numeroActivacion: string | null;
  tipoPlan: string | null;
  tieneCargador: boolean;
  estado: string;
  condicion: string;
  fechaEntrega: string;
  lugarEntrega: string | null;
  entregadoPor: string | null;
};

type MonitorAsignado = {
  asignacionId: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  pulgadas: number | null;
  estado: string;
  condicion: string;
  fechaEntrega: string;
  lugarEntrega: string | null;
  entregadoPor: string | null;
};

type Ficha = {
  empleado: {
    id: string;
    rut: string;
    nombreCompleto: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    correo: string;
    cargo: string | null;
    jefatura: string | null;
    supervisor: string | null;
    ubicacion: string | null;
    tipoContrato: string;
    fechaIngreso: string | null;
    fechaTermino: string | null;
    estado: string;
    telefonoContacto: string | null;
  };
  notebooks: NotebookAsignado[];
  celulares: CelularAsignado[];
  monitores: MonitorAsignado[];
  otrosEquipos: Array<{
    asignacionId: string;
    categoria: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
    estado: string;
    condicion: string;
    fechaEntrega: string;
  }>;
  kitBienvenida: {
    entregado: boolean;
    fechaEntrega: string | null;
  };
  epp: {
    entregado: boolean;
    fechaEntrega: string | null;
    proximaMantencion: string | null;
  };
  resumen: {
    totalEquiposAsignados: number;
    cantidadNotebooks: number;
    cantidadCelulares: number;
    cantidadMonitores: number;
    cantidadOtrosEquipos: number;
    tieneNotebook: boolean;
    tieneCelular: boolean;
    tieneMonitor: boolean;
    kitBienvenidaEntregado: boolean;
    eppEntregado: boolean;
  };
};

const estadoColors: Record<string, string> = {
  activo: "bg-green-500",
  desvinculado: "bg-red-500",
  licencia: "bg-yellow-500",
};

const tipoContratoLabels: Record<string, string> = {
  planta: "Planta",
  proyecto: "Proyecto",
  externo: "Externo",
};

function formatDate(dateString: string | null): string {
  if (!dateString) return "-";
  return new Date(dateString).toLocaleDateString("es-CL");
}

export default function FichaEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<{
    asignacionId: string;
    categoria: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
  } | null>(null);

  useEffect(() => {
    fetchFicha();
  }, [id]);

  async function fetchFicha() {
    try {
      const res = await fetch(`/api/empleados/${id}/ficha`);
      if (!res.ok) {
        throw new Error("Empleado no encontrado");
      }
      const data = await res.json();
      setFicha(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  function handleReturnAssetClick(asset: {
    asignacionId: string;
    categoria: string;
    marca: string;
    modelo: string;
    numeroSerie: string | null;
  }) {
    setSelectedAsset(asset);
    setReturnModalOpen(true);
  }

  async function handleReturnAssetConfirm(data: ReturnAssetData) {
    if (!selectedAsset) return;

    const res = await fetch(`/api/asignaciones/${selectedAsset.asignacionId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || "Error al devolver activo");
    }

    // Refresh the page data
    await fetchFicha();
    setReturnModalOpen(false);
    setSelectedAsset(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Cargando ficha...</div>
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/empleados"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Error</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-red-700">
          {error || "No se pudo cargar la ficha del empleado"}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/empleados"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              Ficha de Empleado
            </h1>
            <p className="text-gray-600">
              {ficha.empleado.nombreCompleto}
            </p>
          </div>
        </div>
        <Link
          href={`/empleados/${id}/editar`}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Edit size={20} />
          <span>Editar</span>
        </Link>
      </div>

      {/* Ficha Azul - Datos del Empleado */}
      <div className="bg-blue-600 rounded-lg shadow-lg text-white p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-blue-500 rounded-full flex items-center justify-center">
              <User size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{ficha.empleado.nombreCompleto}</h2>
              <p className="text-blue-200 font-mono">{ficha.empleado.rut}</p>
            </div>
          </div>
          <div className={cn(
            "px-3 py-1 rounded-full text-sm font-medium",
            estadoColors[ficha.empleado.estado]
          )}>
            {ficha.empleado.estado.charAt(0).toUpperCase() + ficha.empleado.estado.slice(1)}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-blue-300" />
            <span>{ficha.empleado.correo}</span>
          </div>
          {ficha.empleado.telefonoContacto && (
            <div className="flex items-center gap-2">
              <Phone size={18} className="text-blue-300" />
              <span>{ficha.empleado.telefonoContacto}</span>
            </div>
          )}
          {ficha.empleado.cargo && (
            <div className="flex items-center gap-2">
              <Briefcase size={18} className="text-blue-300" />
              <span>{ficha.empleado.cargo}</span>
            </div>
          )}
          {ficha.empleado.ubicacion && (
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-blue-300" />
              <span>{ficha.empleado.ubicacion}</span>
            </div>
          )}
          {ficha.empleado.jefatura && (
            <div className="flex items-center gap-2">
              <Building size={18} className="text-blue-300" />
              <span>Jefe: {ficha.empleado.jefatura}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-blue-300" />
            <span>
              {tipoContratoLabels[ficha.empleado.tipoContrato]} desde{" "}
              {formatDate(ficha.empleado.fechaIngreso)}
            </span>
          </div>
        </div>
      </div>

      {/* Resumen de equipos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className={cn(
          "bg-white rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.tieneNotebook ? "border-l-4 border-green-500" : "border-l-4 border-gray-300"
        )}>
          <Laptop className={ficha.resumen.tieneNotebook ? "text-green-500" : "text-gray-400"} />
          <div>
            <p className="text-sm text-gray-500">Notebook</p>
            <p className="font-semibold">{ficha.resumen.tieneNotebook ? "Asignado" : "Sin asignar"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-white rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.tieneCelular ? "border-l-4 border-green-500" : "border-l-4 border-gray-300"
        )}>
          <Smartphone className={ficha.resumen.tieneCelular ? "text-green-500" : "text-gray-400"} />
          <div>
            <p className="text-sm text-gray-500">Celular</p>
            <p className="font-semibold">{ficha.resumen.tieneCelular ? "Asignado" : "Sin asignar"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-white rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.tieneMonitor ? "border-l-4 border-green-500" : "border-l-4 border-gray-300"
        )}>
          <Monitor className={ficha.resumen.tieneMonitor ? "text-green-500" : "text-gray-400"} />
          <div>
            <p className="text-sm text-gray-500">Monitor</p>
            <p className="font-semibold">{ficha.resumen.tieneMonitor ? "Asignado" : "Sin asignar"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-white rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.kitBienvenidaEntregado ? "border-l-4 border-green-500" : "border-l-4 border-gray-300"
        )}>
          <Gift className={ficha.resumen.kitBienvenidaEntregado ? "text-green-500" : "text-gray-400"} />
          <div>
            <p className="text-sm text-gray-500">Kit Bienvenida</p>
            <p className="font-semibold">{ficha.resumen.kitBienvenidaEntregado ? "Entregado" : "Pendiente"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-white rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.eppEntregado ? "border-l-4 border-green-500" : "border-l-4 border-gray-300"
        )}>
          <HardHat className={ficha.resumen.eppEntregado ? "text-green-500" : "text-gray-400"} />
          <div>
            <p className="text-sm text-gray-500">EPP</p>
            <p className="font-semibold">{ficha.resumen.eppEntregado ? "Entregado" : "Pendiente"}</p>
          </div>
        </div>
      </div>

      {/* Notebooks */}
      {ficha.notebooks.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-3">
              <Laptop className="text-blue-600" />
              <h3 className="text-lg font-semibold">
                Notebooks {ficha.notebooks.length > 1 && `(${ficha.notebooks.length})`}
              </h3>
            </div>
          </div>
          <div className="divide-y">
            {ficha.notebooks.map((notebook, index) => (
              <div key={notebook.asignacionId} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  {ficha.notebooks.length > 1 && (
                    <h4 className="text-sm font-semibold text-gray-700">
                      Notebook {index + 1}
                    </h4>
                  )}
                  <button
                    onClick={() =>
                      handleReturnAssetClick({
                        asignacionId: notebook.asignacionId,
                        categoria: "Notebook",
                        marca: notebook.marca,
                        modelo: notebook.modelo,
                        numeroSerie: notebook.numeroSerie,
                      })
                    }
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors"
                  >
                    <RotateCcw size={16} />
                    <span>Devolver</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Marca / Modelo</p>
                    <p className="font-medium">{notebook.marca} {notebook.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">N° Serie</p>
                    <p className="font-medium font-mono">{notebook.numeroSerie || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Procesador</p>
                    <p className="font-medium">{notebook.procesador || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">RAM</p>
                    <p className="font-medium">{notebook.ram || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Disco Duro</p>
                    <p className="font-medium">{notebook.discoDuro || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Sistema Operativo</p>
                    <p className="font-medium">{notebook.sistemaOperativo || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Microsoft 365</p>
                    <p className="font-medium flex items-center gap-1">
                      {notebook.microsoft365 ? (
                        <><CheckCircle size={16} className="text-green-500" /> Sí</>
                      ) : (
                        <><XCircle size={16} className="text-red-500" /> No</>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fecha Entrega</p>
                    <p className="font-medium">{formatDate(notebook.fechaEntrega)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Celulares */}
      {ficha.celulares.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-3">
              <Smartphone className="text-green-600" />
              <h3 className="text-lg font-semibold">
                Celulares {ficha.celulares.length > 1 && `(${ficha.celulares.length})`}
              </h3>
            </div>
          </div>
          <div className="divide-y">
            {ficha.celulares.map((celular, index) => (
              <div key={celular.asignacionId} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  {ficha.celulares.length > 1 && (
                    <h4 className="text-sm font-semibold text-gray-700">
                      Celular {index + 1}
                    </h4>
                  )}
                  <button
                    onClick={() =>
                      handleReturnAssetClick({
                        asignacionId: celular.asignacionId,
                        categoria: "Celular",
                        marca: celular.marca,
                        modelo: celular.modelo,
                        numeroSerie: celular.numeroSerie,
                      })
                    }
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors"
                  >
                    <RotateCcw size={16} />
                    <span>Devolver</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Marca / Modelo</p>
                    <p className="font-medium">{celular.marca} {celular.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">N° Serie</p>
                    <p className="font-medium font-mono">{celular.numeroSerie || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">IMEI</p>
                    <p className="font-medium font-mono">{celular.imei || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">N° Teléfono</p>
                    <p className="font-medium">{celular.numeroTelefono || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Tipo Plan</p>
                    <p className="font-medium">{celular.tipoPlan || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Cargador</p>
                    <p className="font-medium flex items-center gap-1">
                      {celular.tieneCargador ? (
                        <><CheckCircle size={16} className="text-green-500" /> Sí</>
                      ) : (
                        <><XCircle size={16} className="text-red-500" /> No</>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fecha Entrega</p>
                    <p className="font-medium">{formatDate(celular.fechaEntrega)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Lugar Entrega</p>
                    <p className="font-medium">{celular.lugarEntrega || "-"}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Monitores */}
      {ficha.monitores.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-gray-50">
            <div className="flex items-center gap-3">
              <Monitor className="text-purple-600" />
              <h3 className="text-lg font-semibold">
                Monitores {ficha.monitores.length > 1 && `(${ficha.monitores.length})`}
              </h3>
            </div>
          </div>
          <div className="divide-y">
            {ficha.monitores.map((monitor, index) => (
              <div key={monitor.asignacionId} className="p-6">
                <div className="flex items-start justify-between mb-4">
                  {ficha.monitores.length > 1 && (
                    <h4 className="text-sm font-semibold text-gray-700">
                      Monitor {index + 1}
                    </h4>
                  )}
                  <button
                    onClick={() =>
                      handleReturnAssetClick({
                        asignacionId: monitor.asignacionId,
                        categoria: "Monitor",
                        marca: monitor.marca,
                        modelo: monitor.modelo,
                        numeroSerie: monitor.numeroSerie,
                      })
                    }
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors"
                  >
                    <RotateCcw size={16} />
                    <span>Devolver</span>
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Marca / Modelo</p>
                    <p className="font-medium">{monitor.marca} {monitor.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">N° Serie</p>
                    <p className="font-medium font-mono">{monitor.numeroSerie || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Pulgadas</p>
                    <p className="font-medium">{monitor.pulgadas || "-"}"</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Fecha Entrega</p>
                    <p className="font-medium">{formatDate(monitor.fechaEntrega)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Otros Equipos */}
      {ficha.otrosEquipos.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center gap-3 bg-gray-50">
            <Package className="text-orange-600" />
            <h3 className="text-lg font-semibold">Otros Equipos</h3>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Marca/Modelo</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">N° Serie</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha Entrega</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ficha.otrosEquipos.map((equipo) => (
                    <tr key={equipo.asignacionId}>
                      <td className="px-4 py-2">{equipo.categoria}</td>
                      <td className="px-4 py-2">{equipo.marca} {equipo.modelo}</td>
                      <td className="px-4 py-2 font-mono">{equipo.numeroSerie || "-"}</td>
                      <td className="px-4 py-2">{formatDate(equipo.fechaEntrega)}</td>
                      <td className="px-4 py-2">
                        <button
                          onClick={() =>
                            handleReturnAssetClick({
                              asignacionId: equipo.asignacionId,
                              categoria: equipo.categoria,
                              marca: equipo.marca,
                              modelo: equipo.modelo,
                              numeroSerie: equipo.numeroSerie,
                            })
                          }
                          className="flex items-center gap-1 px-2 py-1 text-xs bg-orange-50 text-orange-700 hover:bg-orange-100 border border-orange-200 rounded transition-colors"
                        >
                          <RotateCcw size={14} />
                          <span>Devolver</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Kit Bienvenida y EPP */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Kit Bienvenida */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center gap-3 bg-gray-50">
            <Gift className="text-pink-600" />
            <h3 className="text-lg font-semibold">Kit de Bienvenida</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-gray-400" />
                  <span className="text-sm text-gray-500">Fecha de Entrega</span>
                </div>
                <span className="font-medium">
                  {ficha.kitBienvenida.fechaEntrega
                    ? formatDate(ficha.kitBienvenida.fechaEntrega)
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Estado</span>
                <span className={cn(
                  "px-3 py-1 text-sm font-medium rounded-full flex items-center gap-1",
                  ficha.kitBienvenida.entregado
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-800"
                )}>
                  {ficha.kitBienvenida.entregado ? (
                    <><CheckCircle size={16} /> Entregado</>
                  ) : (
                    <><XCircle size={16} /> Pendiente</>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* EPP */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b flex items-center gap-3 bg-gray-50">
            <HardHat className="text-yellow-600" />
            <h3 className="text-lg font-semibold">EPP</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-gray-400" />
                  <span className="text-sm text-gray-500">Fecha de Entrega</span>
                </div>
                <span className="font-medium">
                  {ficha.epp.fechaEntrega
                    ? formatDate(ficha.epp.fechaEntrega)
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar size={18} className="text-gray-400" />
                  <span className="text-sm text-gray-500">Próxima Mantención</span>
                </div>
                <span className="font-medium">
                  {ficha.epp.proximaMantencion
                    ? formatDate(ficha.epp.proximaMantencion)
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-500">Estado</span>
                <span className={cn(
                  "px-3 py-1 text-sm font-medium rounded-full flex items-center gap-1",
                  ficha.epp.entregado
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-gray-800"
                )}>
                  {ficha.epp.entregado ? (
                    <><CheckCircle size={16} /> Entregado</>
                  ) : (
                    <><XCircle size={16} /> Pendiente</>
                  )}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Return Asset Modal */}
      {selectedAsset && (
        <ReturnAssetModal
          isOpen={returnModalOpen}
          onClose={() => {
            setReturnModalOpen(false);
            setSelectedAsset(null);
          }}
          onConfirm={handleReturnAssetConfirm}
          assetInfo={selectedAsset}
        />
      )}
    </div>
  );
}
