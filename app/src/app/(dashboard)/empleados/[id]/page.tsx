"use client";

import { useState, useEffect, useCallback, use } from "react";
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
} from "lucide-react";
import { cn } from "@/shared/cn";
import type { EstadoEmpleado, TipoContrato } from "@prisma/client";
import { formatearFecha } from "@/shared/utilidades/fechas";
import { buttonClasses } from "@/shared/ui/buttonStyles";
import { identificadorActivo, textoLineas } from "@/modules/activos";
import { HistorialAsignaciones } from "@/modules/personas/componentes";

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
  tipoLicenciaMicrosoft365: string | null;
  estado: string;
  condicion: string;
  fechaEntrega: string | null;
  lugarEntrega: string | null;
  entregadoPor: string | null;
};

type CelularAsignado = {
  asignacionId: string;
  marca: string;
  modelo: string;
  numeroSerie: string | null;
  imei: string | null;
  lineas: { numero: string; plan: { nombre: string } | null }[];
  numeroActivacion: string | null;
  tieneCargador: boolean;
  estado: string;
  condicion: string;
  fechaEntrega: string | null;
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
  fechaEntrega: string | null;
  lugarEntrega: string | null;
  entregadoPor: string | null;
};

type Ficha = {
  empleado: {
    id: string;
    rut: string | null;
    nombreCompleto: string;
    nombres: string;
    apellidoPaterno: string;
    apellidoMaterno: string | null;
    correoPersonal: string;
    correoEmpresa: string | null;
    cargo: string | null;
    jefatura: string | null;
    supervisor: string | null;
    ubicacion: string | null;
    tipoContrato: TipoContrato | null; // null: importado, aun sin definir
    fechaIngreso: string | null;
    fechaTermino: string | null;
    estado: EstadoEmpleado;
    telefonoContacto: string | null;
  };
  lineas: { id: string; numero: string; plan: { nombre: string } | null }[];
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
    fechaEntrega: string | null;
  }>;
  kitBienvenida: {
    entregado: boolean;
  };
  epp: {
    entregado: boolean;
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

const estadoColors: Record<EstadoEmpleado, string> = {
  activo: "bg-green-500",
  desvinculado: "bg-red-500",
  licencia: "bg-yellow-500",
};

const tipoContratoLabels: Record<TipoContrato, string> = {
  contrato: "Contrato",
  boleta: "Boleta",
};

export default function FichaEmpleadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchFicha = useCallback(async () => {
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
  }, [id]);

  useEffect(() => {
    fetchFicha();
  }, [fetchFicha]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-fg-subtle">Cargando ficha...</div>
      </div>
    );
  }

  if (error || !ficha) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link
            href="/activos/empleados"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-2xl font-bold text-fg">Error</h1>
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
            href="/activos/empleados"
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-fg">
              Ficha de Empleado
            </h1>
            <p className="text-fg-muted">
              {ficha.empleado.nombreCompleto}
            </p>
          </div>
        </div>
        <Link
          href={`/empleados/${id}/editar`}
          className={buttonClasses()}
        >
          <Edit size={20} />
          <span>Editar</span>
        </Link>
      </div>

      {/* Ficha Azul - Datos del Empleado */}
      <div className="bg-brand rounded-lg shadow-lg text-white p-6">
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center">
              <User size={32} />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{ficha.empleado.nombreCompleto}</h2>
              <p className="text-primary-200 font-mono">
                {ficha.empleado.rut || "Sin RUT"}
              </p>
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
            <Mail size={18} className="text-primary-300" />
            {/* Puede faltar: los que llegan de Microsoft traen solo el de empresa. */}
            <span>{ficha.empleado.correoPersonal || "Sin correo personal"}</span>
          </div>
          {ficha.empleado.correoEmpresa && (
            <div className="flex items-center gap-2">
              <Mail size={18} className="text-primary-300" />
              <span>{ficha.empleado.correoEmpresa} (empresa)</span>
            </div>
          )}
          {ficha.empleado.telefonoContacto && (
            <div className="flex items-center gap-2">
              <Phone size={18} className="text-primary-300" />
              <span>{ficha.empleado.telefonoContacto}</span>
            </div>
          )}
          {ficha.empleado.cargo && (
            <div className="flex items-center gap-2">
              <Briefcase size={18} className="text-primary-300" />
              <span>{ficha.empleado.cargo}</span>
            </div>
          )}
          {ficha.empleado.ubicacion && (
            <div className="flex items-center gap-2">
              <MapPin size={18} className="text-primary-300" />
              <span>{ficha.empleado.ubicacion}</span>
            </div>
          )}
          {ficha.empleado.jefatura && (
            <div className="flex items-center gap-2">
              <Building size={18} className="text-primary-300" />
              <span>Jefe: {ficha.empleado.jefatura}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-primary-300" />
            <span>
              {ficha.empleado.tipoContrato ? tipoContratoLabels[ficha.empleado.tipoContrato] : "Contrato sin definir,"} desde{" "}
              {formatearFecha(ficha.empleado.fechaIngreso, {}, "-")}
            </span>
          </div>
        </div>
      </div>

      {/* Resumen de equipos */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className={cn(
          "bg-surface rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.tieneNotebook ? "border-l-4 border-green-500" : "border-l-4 border-line-strong"
        )}>
          <Laptop className={ficha.resumen.tieneNotebook ? "text-green-500" : "text-fg-subtle"} />
          <div>
            <p className="text-sm text-fg-subtle">Notebook</p>
            <p className="font-semibold">{ficha.resumen.tieneNotebook ? "Asignado" : "Sin asignar"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-surface rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.tieneCelular ? "border-l-4 border-green-500" : "border-l-4 border-line-strong"
        )}>
          <Smartphone className={ficha.resumen.tieneCelular ? "text-green-500" : "text-fg-subtle"} />
          <div>
            <p className="text-sm text-fg-subtle">Celular</p>
            <p className="font-semibold">{ficha.resumen.tieneCelular ? "Asignado" : "Sin asignar"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-surface rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.tieneMonitor ? "border-l-4 border-green-500" : "border-l-4 border-line-strong"
        )}>
          <Monitor className={ficha.resumen.tieneMonitor ? "text-green-500" : "text-fg-subtle"} />
          <div>
            <p className="text-sm text-fg-subtle">Monitor</p>
            <p className="font-semibold">{ficha.resumen.tieneMonitor ? "Asignado" : "Sin asignar"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-surface rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.kitBienvenidaEntregado ? "border-l-4 border-green-500" : "border-l-4 border-line-strong"
        )}>
          <Gift className={ficha.resumen.kitBienvenidaEntregado ? "text-green-500" : "text-fg-subtle"} />
          <div>
            <p className="text-sm text-fg-subtle">Kit Bienvenida</p>
            <p className="font-semibold">{ficha.resumen.kitBienvenidaEntregado ? "Entregado" : "Pendiente"}</p>
          </div>
        </div>
        <div className={cn(
          "bg-surface rounded-lg shadow p-4 flex items-center gap-3",
          ficha.resumen.eppEntregado ? "border-l-4 border-green-500" : "border-l-4 border-line-strong"
        )}>
          <HardHat className={ficha.resumen.eppEntregado ? "text-green-500" : "text-fg-subtle"} />
          <div>
            <p className="text-sm text-fg-subtle">EPP</p>
            <p className="font-semibold">{ficha.resumen.eppEntregado ? "Entregado" : "Pendiente"}</p>
          </div>
        </div>
      </div>

      {/* Notebooks */}
      {ficha.notebooks.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-surface-muted">
            <div className="flex items-center gap-3">
              <Laptop className="text-primary-700" />
              <h3 className="text-lg font-semibold">
                Notebooks {ficha.notebooks.length > 1 && `(${ficha.notebooks.length})`}
              </h3>
            </div>
          </div>
          <div className="divide-y">
            {ficha.notebooks.map((notebook, index) => (
              <div key={notebook.asignacionId} className="p-6">
                {ficha.notebooks.length > 1 && (
                  <h4 className="text-sm font-semibold text-fg-muted mb-4">
                    Notebook {index + 1}
                  </h4>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-fg-subtle">Marca / Modelo</p>
                    <p className="font-medium">{notebook.marca} {notebook.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">N° Serie</p>
                    <p className="font-medium font-mono">{identificadorActivo(notebook, "-")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Procesador</p>
                    <p className="font-medium">{notebook.procesador || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">RAM</p>
                    <p className="font-medium">{notebook.ram || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Disco Duro</p>
                    <p className="font-medium">{notebook.discoDuro || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Sistema Operativo</p>
                    <p className="font-medium">{notebook.sistemaOperativo || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Licencia Microsoft 365</p>
                    {/* Muestra el plan de Microsoft 365 cuando esta registrado;
                        el Si/No solo se usa cuando no hay plan. */}
                    <p className="font-medium flex items-center gap-1">
                      {notebook.tipoLicenciaMicrosoft365 ? (
                        <><CheckCircle size={16} className="text-green-500" /> {notebook.tipoLicenciaMicrosoft365}</>
                      ) : notebook.microsoft365 ? (
                        <><CheckCircle size={16} className="text-green-500" /> Sin plan registrado</>
                      ) : (
                        <><XCircle size={16} className="text-red-500" /> Sin licencia</>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Fecha Entrega</p>
                    <p className="font-medium">{formatearFecha(notebook.fechaEntrega, {}, "-")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lineas telefonicas a su nombre (SPEC 2.131) */}
      {ficha.lineas.length > 0 && (
        <div className="card p-6">
          <h3 className="mb-4 flex items-center gap-3 text-lg font-semibold">
            <Phone className="text-green-600" /> Líneas en su teléfono personal
          </h3>
          <ul className="space-y-1 text-sm">
            {ficha.lineas.map((l) => (
              <li key={l.id}>
                <span className="font-medium">{textoLineas([l])}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Celulares */}
      {ficha.celulares.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-surface-muted">
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
                {ficha.celulares.length > 1 && (
                  <h4 className="text-sm font-semibold text-fg-muted mb-4">
                    Celular {index + 1}
                  </h4>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-fg-subtle">Marca / Modelo</p>
                    <p className="font-medium">{celular.marca} {celular.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">N° Serie</p>
                    <p className="font-medium font-mono">{identificadorActivo(celular, "-")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">IMEI</p>
                    <p className="font-medium font-mono">{celular.imei || "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Línea</p>
                    <p className="font-medium">{celular.lineas.length ? textoLineas(celular.lineas) : "-"}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Cargador</p>
                    <p className="font-medium flex items-center gap-1">
                      {celular.tieneCargador ? (
                        <><CheckCircle size={16} className="text-green-500" /> Sí</>
                      ) : (
                        <><XCircle size={16} className="text-red-500" /> No</>
                      )}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Fecha Entrega</p>
                    <p className="font-medium">{formatearFecha(celular.fechaEntrega, {}, "-")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Lugar Entrega</p>
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
        <div className="card">
          <div className="px-6 py-4 border-b flex items-center justify-between bg-surface-muted">
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
                {ficha.monitores.length > 1 && (
                  <h4 className="text-sm font-semibold text-fg-muted mb-4">
                    Monitor {index + 1}
                  </h4>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <p className="text-sm text-fg-subtle">Marca / Modelo</p>
                    <p className="font-medium">{monitor.marca} {monitor.modelo}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">N° Serie</p>
                    <p className="font-medium font-mono">{identificadorActivo(monitor, "-")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Pulgadas</p>
                    <p className="font-medium">{monitor.pulgadas || "-"}&quot;</p>
                  </div>
                  <div>
                    <p className="text-sm text-fg-subtle">Fecha Entrega</p>
                    <p className="font-medium">{formatearFecha(monitor.fechaEntrega, {}, "-")}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Otros Equipos */}
      {ficha.otrosEquipos.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b flex items-center gap-3 bg-surface-muted">
            <Package className="text-orange-600" />
            <h3 className="text-lg font-semibold">Otros Equipos</h3>
          </div>
          <div className="p-6">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-surface-muted">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-fg-subtle uppercase">Tipo</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-fg-subtle uppercase">Marca/Modelo</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-fg-subtle uppercase">N° Serie</th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-fg-subtle uppercase">Fecha Entrega</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {ficha.otrosEquipos.map((equipo) => (
                    <tr key={equipo.asignacionId}>
                      <td className="px-4 py-2">{equipo.categoria}</td>
                      <td className="px-4 py-2">{equipo.marca} {equipo.modelo}</td>
                      <td className="px-4 py-2 font-mono">{identificadorActivo(equipo, "-")}</td>
                      <td className="px-4 py-2">{formatearFecha(equipo.fechaEntrega, {}, "-")}</td>
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
        <div className="card">
          <div className="px-6 py-4 border-b flex items-center gap-3 bg-surface-muted">
            <Gift className="text-pink-600" />
            <h3 className="text-lg font-semibold">Kit de Bienvenida</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-fg-subtle">Estado</span>
                <span className={cn(
                  "px-3 py-1 text-sm font-medium rounded-full flex items-center gap-1",
                  ficha.kitBienvenida.entregado
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-fg"
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
        <div className="card">
          <div className="px-6 py-4 border-b flex items-center gap-3 bg-surface-muted">
            <HardHat className="text-yellow-600" />
            <h3 className="text-lg font-semibold">EPP</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-fg-subtle">Estado</span>
                <span className={cn(
                  "px-3 py-1 text-sm font-medium rounded-full flex items-center gap-1",
                  ficha.epp.entregado
                    ? "bg-green-100 text-green-800"
                    : "bg-gray-100 text-fg"
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

      {/* Todo lo que se le ha asignado a lo largo del tiempo (SPEC 2.132) */}
      <HistorialAsignaciones empleadoId={ficha.empleado.id} />
    </div>
  );
}
