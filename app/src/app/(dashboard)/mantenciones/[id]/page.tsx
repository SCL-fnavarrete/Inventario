"use client";

import { useState, useEffect, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Trash2,
  Play,
  Pencil,
  Hourglass,
} from "lucide-react";
import {
  estadoTrasMantencion,
  etiquetaCondicionActivo,
  etiquetaEstadoActivo,
} from "@/lib/constants/estadosActivo";
import { cn } from "@/lib/utils";
import type { ResultadoMantencion } from "@/lib/validations/assetTransition";
import { parseApiError } from "@/lib/utils/apiErrors";
import { formatearFecha, formatearFechaConHora, aValorInputDate, hoyISO } from "@/lib/utils/fechas";
import { useErroresFormulario } from "@/hooks/useErroresFormulario";
import {
  RESULTADO_MANTENCION_LABEL,
  etiquetaResultadoMantencion,
} from "@/lib/constants/resultadosMantencion";
import { CategoryIcon } from "@/components/activos/CategoryIcon";
import { configEstadoMantencion } from "@/components/mantenciones";
import { Can } from "@/components/auth/Can";
import { AssetStatusBadge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/buttonStyles";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  CampoFormulario,
  CampoTexto,
  ResumenErrores,
  claseCampo,
} from "@/components/ui/CampoFormulario";

type ResultadoTipo = ResultadoMantencion;

type Maintenance = {
  id: string;
  tipo: { id: string; nombre: string };
  descripcion: string;
  fechaProgramada: string | null;
  horaProgramada: string | null;
  fechaRealizada: string | null;
  proximaMantencion: string | null;
  realizadoPor: string | null;
  costo: number | null;
  proveedorExterno: string | null;
  estado: string;
  resultado: string | null;
  resultadoTipo: string | null;
  createdAt: string;
  asset: {
    id: string;
    numeroSerie: string | null;
    marca: string;
    modelo: string;
    estado: string;
    condicion: string;
    empleadoActualId: string | null;
    categoria: { nombre: string };
    empleadoActual: {
      id: string;
      rut: string | null;
      nombres: string;
      apellidoPaterno: string;
      cargo: string | null;
    } | null;
  };
};

const ETIQUETAS_EDITAR = {
  tipoId: "Tipo",
  fechaProgramada: "Fecha",
  horaProgramada: "Hora",
  descripcion: "Descripción",
};

const ETIQUETAS_COMPLETAR = {
  fechaRealizada: "Fecha realizada",
  resultado: "Resultado",
  motivoBaja: "Motivo de la baja",
};

// Cada resultado dice como queda el equipo y que hace el sistema (SPEC 2.99).
const OPCIONES_RESULTADO: {
  valor: ResultadoTipo;
  icono: typeof CheckCircle;
  detalle: (vuelveA: string) => string;
  boton: string;
  seleccionado: string;
  claseBoton: string;
}[] = [
  {
    valor: "reparado",
    icono: CheckCircle,
    detalle: (vuelveA) => `Queda funcionando y vuelve a ${vuelveA}.`,
    boton: "Cerrar como reparado",
    seleccionado: "border-green-600 bg-green-50 text-green-800",
    claseBoton: buttonClasses({ className: "bg-success hover:bg-success-hover disabled:hover:bg-success" }),
  },
  {
    valor: "pendiente_repuestos",
    icono: Hourglass,
    detalle: () => "Sigue en mantención hasta que lleguen.",
    boton: "Guardar y esperar repuestos",
    seleccionado: "border-amber-500 bg-amber-50 text-amber-800",
    claseBoton: buttonClasses({ className: "bg-amber-500 hover:bg-amber-600 disabled:hover:bg-amber-500" }),
  },
  {
    valor: "no_reparable",
    icono: XCircle,
    detalle: () => "No tiene arreglo: el equipo se da de baja.",
    boton: "Cerrar y dar de baja",
    seleccionado: "border-red-600 bg-red-50 text-red-800",
    claseBoton: buttonClasses({ variant: "danger" }),
  },
];

function formatCurrency(amount: number | null): string {
  if (!amount) return "-";
  return new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP" }).format(amount);
}

function Dato({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-sm text-fg-subtle">{label}</p>
      <div className="font-medium text-fg">{children}</div>
    </div>
  );
}

export default function MantencionDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: session } = useSession();
  const [maintenance, setMaintenance] = useState<Maintenance | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState<"cancelar" | "eliminar" | null>(null);

  // Editar (solo pendientes).
  const [editando, setEditando] = useState(false);
  const [tipos, setTipos] = useState<{ id: string; nombre: string }[]>([]);
  const [edicion, setEdicion] = useState({ tipoId: "", fechaProgramada: "", horaProgramada: "", descripcion: "" });
  const erroresEdicion = useErroresFormulario(ETIQUETAS_EDITAR);

  // Completar (solo en proceso).
  const [completeForm, setCompleteForm] = useState({
    fechaRealizada: hoyISO(),
    resultado: "",
    resultadoTipo: "reparado" as ResultadoTipo,
    motivoBaja: "",
    proximaMantencion: "",
  });
  const erroresCompletar = useErroresFormulario(ETIQUETAS_COMPLETAR);

  const fetchMaintenance = useCallback(async () => {
    try {
      const res = await fetch(`/api/mantenciones/${id}`);
      if (!res.ok) throw new Error("Mantención no encontrada");
      setMaintenance(await res.json());
      setCompleteForm({
        fechaRealizada: hoyISO(),
        resultado: "",
        resultadoTipo: "reparado",
        motivoBaja: "",
        proximaMantencion: "",
      });
    } catch (err) {
      console.error("Error fetching maintenance:", err);
      setError("Error al cargar mantención");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchMaintenance();
  }, [fetchMaintenance]);

  /** PUT/POST/DELETE a la mantencion: { ok } o el mensaje y los errores por campo. */
  async function enviar(url: string, method: string, body: unknown, fallback: string) {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const { message, fieldErrors } = await parseApiError(res, fallback);
        return { ok: false as const, message, fieldErrors };
      }
      return { ok: true as const };
    } catch {
      return { ok: false as const, message: fallback, fieldErrors: {} };
    } finally {
      setSubmitting(false);
    }
  }

  async function iniciar() {
    const r = await enviar(`/api/mantenciones/${id}`, "PUT", { estado: "en_proceso" }, "Error al iniciar mantención");
    if (!r.ok) return setError(r.message);
    fetchMaintenance();
  }

  async function cancelar() {
    const r = await enviar(`/api/mantenciones/${id}`, "PUT", { estado: "cancelada" }, "Error al cancelar mantención");
    setConfirmar(null);
    if (!r.ok) return setError(r.message);
    fetchMaintenance();
  }

  async function eliminar() {
    const r = await enviar(`/api/mantenciones/${id}`, "DELETE", null, "Error al eliminar mantención");
    setConfirmar(null);
    if (!r.ok) return setError(r.message);
    router.push("/mantenciones");
  }

  function abrirEdicion() {
    if (!maintenance) return;
    setEdicion({
      tipoId: maintenance.tipo.id,
      fechaProgramada: aValorInputDate(maintenance.fechaProgramada),
      horaProgramada: maintenance.horaProgramada ?? "",
      descripcion: maintenance.descripcion,
    });
    erroresEdicion.reportar({});
    setEditando(true);
    if (tipos.length === 0) {
      fetch("/api/mantenciones/tipos?activo=true")
        .then((r) => (r.ok ? r.json() : []))
        .then(setTipos)
        .catch(() => setTipos([]));
    }
  }

  function cambiarEdicion<K extends keyof typeof edicion>(campo: K, valor: string) {
    setEdicion((prev) => ({ ...prev, [campo]: valor }));
    erroresEdicion.limpiar(campo);
  }

  async function guardarEdicion(ev: React.FormEvent) {
    ev.preventDefault();
    const faltan: Record<string, string> = {};
    if (!edicion.tipoId) faltan.tipoId = "Elige el tipo";
    if (!edicion.fechaProgramada) faltan.fechaProgramada = "Elige la fecha";
    if (!edicion.descripcion.trim()) faltan.descripcion = "Describe qué se va a hacer";
    if (erroresEdicion.reportar(faltan)) return;
    const r = await enviar(
      `/api/mantenciones/${id}`,
      "PUT",
      { ...edicion, horaProgramada: edicion.horaProgramada || null },
      "Error al guardar la mantención"
    );
    if (!r.ok) {
      if (Object.keys(r.fieldErrors).length > 0) erroresEdicion.reportar(r.fieldErrors);
      else setError(r.message);
      return;
    }
    setEditando(false);
    fetchMaintenance();
  }

  function cambiarCompletar<K extends keyof typeof completeForm>(campo: K, valor: (typeof completeForm)[K]) {
    setCompleteForm((prev) => ({ ...prev, [campo]: valor }));
    erroresCompletar.limpiar(campo);
  }

  async function completar(ev: React.FormEvent) {
    ev.preventDefault();
    const faltan: Record<string, string> = {};
    if (!completeForm.fechaRealizada) faltan.fechaRealizada = "Elige la fecha";
    if (!completeForm.resultado.trim())
      faltan.resultado =
        completeForm.resultadoTipo === "pendiente_repuestos"
          ? "Anota qué repuesto falta"
          : "Describe qué se hizo";
    if (completeForm.resultadoTipo === "no_reparable" && !completeForm.motivoBaja.trim())
      faltan.motivoBaja = "Escribe por qué no se puede reparar";
    if (erroresCompletar.reportar(faltan)) return;

    const r = await enviar(
      `/api/mantenciones/${id}/completar`,
      "POST",
      {
        fechaRealizada: completeForm.fechaRealizada,
        realizadoPor: session?.user?.name || session?.user?.email || "",
        resultado: completeForm.resultado,
        resultadoTipo: completeForm.resultadoTipo,
        motivoBaja: completeForm.resultadoTipo === "no_reparable" ? completeForm.motivoBaja : null,
        proximaMantencion:
          completeForm.resultadoTipo === "reparado" ? completeForm.proximaMantencion || null : null,
      },
      "Error al completar mantención"
    );
    if (!r.ok) {
      if (Object.keys(r.fieldErrors).length > 0) erroresCompletar.reportar(r.fieldErrors);
      else setError(r.message);
      return;
    }
    fetchMaintenance();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-fg-subtle" />
      </div>
    );
  }

  if (!maintenance) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-red-800">Mantención no encontrada</h2>
        <Link href="/mantenciones" className="text-red-600 hover:underline mt-2 inline-block">
          Volver al listado
        </Link>
      </div>
    );
  }

  const config = configEstadoMantencion(maintenance);
  const StatusIcon = config.icon;
  const esperandoRepuestos =
    maintenance.estado === "en_proceso" && maintenance.resultadoTipo === "pendiente_repuestos";
  const fechaTexto = formatearFechaConHora(maintenance.fechaProgramada, maintenance.horaProgramada, "-");
  const vuelveA = etiquetaEstadoActivo(estadoTrasMantencion(maintenance.asset));
  const opcionElegida =
    OPCIONES_RESULTADO.find((o) => o.valor === completeForm.resultadoTipo) ?? OPCIONES_RESULTADO[0];

  return (
    <div className="space-y-6">
      <PageHeader
        backHref="/mantenciones"
        title="Detalle de Mantención"
        description={<>{maintenance.asset.marca} {maintenance.asset.modelo}</>}
        actions={
          <>
            {maintenance.estado === "pendiente" && !editando && (
              <>
                <Can recurso="mantenciones">
                  <button onClick={iniciar} disabled={submitting} className={buttonClasses()}>
                    <Play size={18} /> Iniciar
                  </button>
                  <button onClick={abrirEdicion} className={buttonClasses({ variant: "outline" })}>
                    <Pencil size={18} /> Editar
                  </button>
                </Can>
                <Can recurso="mantenciones" accion="delete">
                  <button onClick={() => setConfirmar("eliminar")} className={buttonClasses({ variant: "danger" })}>
                    <Trash2 size={18} /> Eliminar
                  </button>
                </Can>
              </>
            )}
            {maintenance.estado === "en_proceso" && (
              <Can recurso="mantenciones">
                <button
                  onClick={() => setConfirmar("cancelar")}
                  disabled={submitting}
                  className={buttonClasses({ variant: "outline", className: "text-red-600 border-red-300" })}
                >
                  <XCircle size={18} /> Cancelar mantención
                </button>
              </Can>
            )}
          </>
        }
      />

      {/* Estado */}
      <div className={cn("rounded-lg p-4 flex items-center gap-3", config.bgColor)}>
        <StatusIcon className={cn("h-6 w-6", config.color)} />
        <div>
          <p className={cn("font-semibold", config.color)}>
            {esperandoRepuestos ? `En Proceso · ${config.label}` : config.label}
          </p>
          {esperandoRepuestos ? (
            <p className="text-sm text-fg-muted">{maintenance.resultado}</p>
          ) : maintenance.estado === "completada" && maintenance.fechaRealizada ? (
            <p className="text-sm text-fg-muted">Completada el {formatearFecha(maintenance.fechaRealizada, {}, "-")}</p>
          ) : maintenance.fechaProgramada ? (
            <p className="text-sm text-fg-muted">Programada para el {fechaTexto}</p>
          ) : null}
          {maintenance.estado === "pendiente" && (
            <p className="text-xs text-fg-subtle mt-0.5">El equipo pasa a En Mantención al pulsar Iniciar.</p>
          )}
        </div>
      </div>

      <ResumenErrores mensaje={error} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Informacion / edicion */}
          {editando ? (
            <form onSubmit={guardarEdicion} className="card p-4 sm:p-6 space-y-4" noValidate>
              <h2 className="text-lg font-semibold">Editar Mantención</h2>
              <ResumenErrores mensaje={erroresEdicion.resumen} />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <CampoFormulario label="Tipo" obligatorio error={erroresEdicion.errores.tipoId} className="sm:col-span-3">
                  <select
                    value={edicion.tipoId}
                    onChange={(e) => cambiarEdicion("tipoId", e.target.value)}
                    aria-invalid={!!erroresEdicion.errores.tipoId}
                    className={claseCampo(erroresEdicion.errores.tipoId)}
                  >
                    {/* El tipo actual aunque ya no este activo. */}
                    {!tipos.some((t) => t.id === maintenance.tipo.id) && (
                      <option value={maintenance.tipo.id}>{maintenance.tipo.nombre}</option>
                    )}
                    {tipos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre}
                      </option>
                    ))}
                  </select>
                </CampoFormulario>
                <CampoTexto
                  label="Fecha"
                  obligatorio
                  type="date"
                  value={edicion.fechaProgramada}
                  onChange={(v) => cambiarEdicion("fechaProgramada", v)}
                  error={erroresEdicion.errores.fechaProgramada}
                  className="sm:col-span-2"
                />
                <CampoTexto
                  label="Hora (Chile)"
                  type="time"
                  value={edicion.horaProgramada}
                  onChange={(v) => cambiarEdicion("horaProgramada", v)}
                  error={erroresEdicion.errores.horaProgramada}
                  ayuda="Opcional"
                />
                <CampoFormulario
                  label="Descripción"
                  obligatorio
                  error={erroresEdicion.errores.descripcion}
                  className="sm:col-span-3"
                >
                  <textarea
                    rows={3}
                    value={edicion.descripcion}
                    onChange={(e) => cambiarEdicion("descripcion", e.target.value)}
                    aria-invalid={!!erroresEdicion.errores.descripcion}
                    className={claseCampo(erroresEdicion.errores.descripcion)}
                  />
                </CampoFormulario>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEditando(false)} className={buttonClasses({ variant: "outline" })}>
                  Descartar
                </button>
                <button type="submit" disabled={submitting} className={buttonClasses()}>
                  {submitting && <Loader2 className="animate-spin" size={16} />} Guardar cambios
                </button>
              </div>
            </form>
          ) : (
            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-4">Información de la Mantención</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Dato label="Tipo">{maintenance.tipo.nombre}</Dato>
                <Dato label="Fecha programada">{fechaTexto}</Dato>
                <Dato label="Técnico">{maintenance.realizadoPor || "-"}</Dato>
                {/* Costo y proveedor son datos antiguos: solo si vienen. */}
                {maintenance.costo != null && <Dato label="Costo">{formatCurrency(maintenance.costo)}</Dato>}
                {maintenance.proveedorExterno && (
                  <Dato label="Proveedor externo" className="sm:col-span-2">
                    {maintenance.proveedorExterno}
                  </Dato>
                )}
                <Dato label="Descripción" className="sm:col-span-2">
                  <p className="font-normal whitespace-pre-wrap">{maintenance.descripcion}</p>
                </Dato>
              </div>
            </div>
          )}

          {/* Completar */}
          {maintenance.estado === "en_proceso" && (
            <Can recurso="mantenciones">
              <form onSubmit={completar} className="card p-4 sm:p-6 space-y-4" noValidate>
                <h2 className="text-lg font-semibold">Completar Mantención</h2>
                <ResumenErrores mensaje={erroresCompletar.resumen} />

                <div>
                  <p className="field-label mb-2">Resultado de la mantención *</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" role="radiogroup">
                    {OPCIONES_RESULTADO.map((o) => {
                      const elegido = completeForm.resultadoTipo === o.valor;
                      const Icono = o.icono;
                      return (
                        <button
                          key={o.valor}
                          type="button"
                          role="radio"
                          aria-checked={elegido}
                          onClick={() => {
                            cambiarCompletar("resultadoTipo", o.valor);
                            erroresCompletar.limpiar("motivoBaja");
                          }}
                          className={cn(
                            "p-3 rounded-lg border-2 text-left transition-colors",
                            elegido ? o.seleccionado : "border-line text-fg-muted hover:bg-surface-muted"
                          )}
                        >
                          <span className="flex items-center gap-2 font-semibold text-sm">
                            <Icono size={16} className="shrink-0" />
                            {RESULTADO_MANTENCION_LABEL[o.valor]}
                          </span>
                          <span className="block text-xs mt-1 opacity-90">{o.detalle(vuelveA)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <CampoTexto
                    label={completeForm.resultadoTipo === "pendiente_repuestos" ? "Fecha" : "Fecha realizada"}
                    obligatorio
                    type="date"
                    value={completeForm.fechaRealizada}
                    onChange={(v) => cambiarCompletar("fechaRealizada", v)}
                    error={erroresCompletar.errores.fechaRealizada}
                  />
                  <CampoTexto
                    label="Realizado por"
                    value={session?.user?.name || ""}
                    onChange={() => {}}
                    readOnly
                    disabled
                    ayuda="Quien completa la mantención."
                  />
                </div>

                <CampoFormulario
                  label={completeForm.resultadoTipo === "pendiente_repuestos" ? "Repuestos que faltan" : "Resultado"}
                  obligatorio
                  error={erroresCompletar.errores.resultado}
                >
                  <textarea
                    rows={3}
                    placeholder={
                      completeForm.resultadoTipo === "pendiente_repuestos"
                        ? "Qué repuesto falta y a quién se pidió..."
                        : "Qué se hizo..."
                    }
                    value={completeForm.resultado}
                    onChange={(e) => cambiarCompletar("resultado", e.target.value)}
                    aria-invalid={!!erroresCompletar.errores.resultado}
                    className={claseCampo(erroresCompletar.errores.resultado)}
                  />
                </CampoFormulario>

                {completeForm.resultadoTipo === "no_reparable" && (
                  <CampoFormulario label="Motivo de la baja" obligatorio error={erroresCompletar.errores.motivoBaja}>
                    <textarea
                      rows={2}
                      placeholder="Por qué no se puede reparar..."
                      value={completeForm.motivoBaja}
                      onChange={(e) => cambiarCompletar("motivoBaja", e.target.value)}
                      aria-invalid={!!erroresCompletar.errores.motivoBaja}
                      className={claseCampo(erroresCompletar.errores.motivoBaja)}
                    />
                  </CampoFormulario>
                )}

                {completeForm.resultadoTipo === "reparado" && (
                  <CampoTexto
                    label="Próxima mantención"
                    type="date"
                    value={completeForm.proximaMantencion}
                    onChange={(v) => cambiarCompletar("proximaMantencion", v)}
                    ayuda="Opcional: queda programada como pendiente."
                  />
                )}

                <div className="flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className={opcionElegida.claseBoton}
                  >
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <opcionElegida.icono size={18} />}
                    {opcionElegida.boton}
                  </button>
                </div>
              </form>
            </Can>
          )}

          {/* Resultado (cerrada) */}
          {(maintenance.estado === "completada" || maintenance.estado === "cancelada") && maintenance.resultado && (
            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-4">
                {maintenance.estado === "completada" ? "Resultado de la Mantención" : "Motivo de la cancelación"}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {maintenance.estado === "completada" && (
                  <>
                    {maintenance.resultadoTipo && (
                      <Dato label="Resultado" className="sm:col-span-2">
                        {etiquetaResultadoMantencion(maintenance.resultadoTipo)}
                      </Dato>
                    )}
                    <Dato label="Fecha realizada">{formatearFecha(maintenance.fechaRealizada, {}, "-")}</Dato>
                    <Dato label="Próxima mantención">{formatearFecha(maintenance.proximaMantencion, {}, "-")}</Dato>
                  </>
                )}
                <Dato label={maintenance.estado === "completada" ? "Detalle" : "Motivo"} className="sm:col-span-2">
                  <p className="font-normal whitespace-pre-wrap">{maintenance.resultado}</p>
                </Dato>
              </div>
            </div>
          )}
        </div>

        {/* Activo */}
        <div className="space-y-6">
          <div className="card p-4 sm:p-6">
            <h2 className="text-lg font-semibold mb-4">Activo</h2>
            <div className="flex items-center gap-3 mb-4">
              <span className="text-fg-subtle">
                <CategoryIcon categoria={maintenance.asset.categoria.nombre} className="h-5 w-5" />
              </span>
              <div>
                <p className="font-medium">
                  {maintenance.asset.marca} {maintenance.asset.modelo}
                </p>
                <p className="text-sm text-fg-subtle">{maintenance.asset.categoria.nombre}</p>
              </div>
            </div>
            <div className="space-y-3 text-sm">
              <Dato label="N° Serie">
                <span className="font-mono">{maintenance.asset.numeroSerie || "-"}</span>
              </Dato>
              <Dato label="Estado actual">
                <AssetStatusBadge status={maintenance.asset.estado} />
              </Dato>
              <Dato label="Condición">{etiquetaCondicionActivo(maintenance.asset.condicion)}</Dato>
            </div>
            <Link
              href={`/activos/${maintenance.asset.id}`}
              className={buttonClasses({ variant: "outline", className: "w-full mt-4" })}
            >
              Ver detalle del activo
            </Link>
          </div>

          {maintenance.asset.empleadoActual && (
            <div className="card p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-4">Asignado a</h2>
              <div className="space-y-3 text-sm">
                <Dato label="Nombre">
                  {maintenance.asset.empleadoActual.nombres} {maintenance.asset.empleadoActual.apellidoPaterno}
                </Dato>
                <Dato label="RUT">
                  <span className="font-mono">{maintenance.asset.empleadoActual.rut || "—"}</span>
                </Dato>
                <Dato label="Cargo">{maintenance.asset.empleadoActual.cargo || "-"}</Dato>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmar === "cancelar"}
        onClose={() => setConfirmar(null)}
        onConfirm={cancelar}
        variant="warning"
        title="Cancelar mantención"
        message={`La mantención queda cancelada y el equipo vuelve a ${vuelveA}.`}
        confirmLabel="Cancelar mantención"
        cancelLabel="Volver"
        loading={submitting}
      />
      <ConfirmDialog
        isOpen={confirmar === "eliminar"}
        onClose={() => setConfirmar(null)}
        onConfirm={eliminar}
        variant="danger"
        title="Eliminar mantención"
        message="La mantención programada se elimina. El equipo no cambia. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        loading={submitting}
      />
    </div>
  );
}
